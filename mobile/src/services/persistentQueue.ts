/**
 * Persistent Queue with Automatic Recovery
 * Survives app restarts and resume/pause cycles
 * Stores queue state to AsyncStorage with job checkpoints
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import EventEmitter from "eventemitter3";
import * as FileSystem from "expo-file-system";
import { makeDirectoryAsync, copyAsync, getInfoAsync } from "expo-file-system/legacy";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { getJobStatus, submitFileForProcessing, checkScanDelta } from "./apiClient";
import type { ScannableFile } from "./scannerService";

const QUEUE_STORAGE_KEY = "@axyora/persistent-queue";
const CHECKPOINT_INTERVAL = 5; // Save every 5 files

export interface QueueItem {
  id: string;
  file: ScannableFile;
  status: "pending" | "uploading" | "processing" | "done" | "error" | "retrying";
  jobId?: string;
  progress: number;
  currentStep: string;
  chunksProcessed?: number;
  error?: {
    code: string;
    message: string;
    retriable: boolean;
    retryCount: number;
  };
  createdAt: number;
  attemptedAt?: number;
  completedAt?: number;
  /** Total processing duration in milliseconds, set when job completes */
  processingTime?: number;
  /** Timestamp when the job finally failed (non-retriable) */
  failedAt?: number;
  /** Number of retry attempts that have been made for this item */
  retryCount?: number;
}

export interface QueueState {
  items: QueueItem[];
  processing: boolean;
  currentIndex: number;
  lastCheckpoint: number;
  userId: string;
}

class PersistentQueue extends EventEmitter {
  private state: QueueState = {
    items: [],
    processing: false,
    currentIndex: 0,
    lastCheckpoint: Date.now(),
    userId: "",
  };
  private running = false;
  private isAppPaused = false;
  private abortController: AbortController | null = null;

  async initialize(userId: string): Promise<void> {
    this.state.userId = userId;
    try {
      const saved = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as QueueState;
        
        // Validate and filter out corrupted items
        const validItems = parsed.items.filter(item => {
          if (!item || !item.file) {
            return false;
          }
          if (!item.file.uri || !item.file.name) {
            return false;
          }
          return true;
        });
        
        this.state = { 
          ...parsed, 
          userId, 
          processing: false,
          items: validItems,
          currentIndex: Math.min(parsed.currentIndex || 0, validItems.length)
        };

        const nextIndex = validItems.findIndex((item) =>
          ["pending", "retrying", "processing", "uploading"].includes(item.status)
        );
        if (nextIndex !== -1) {
          this.state.currentIndex = nextIndex;
        }
        
        const corruptedCount = parsed.items.length - validItems.length;
        this.emit("queue-restored", {
          count: this.state.items.length,
          failedCount: this.state.items.filter((i) => i.status === "error").length,
          corrupted: corruptedCount,
        });
        
        if (corruptedCount > 0) {
        }

        if (this.state.items.length > 0 && !this.running && !this.isAppPaused) {
          this.start();
        }
      }
    } catch (error) {
      this.state.items = [];
      this.state.currentIndex = 0;
    }
  }

  async enqueue(files: ScannableFile | ScannableFile[]): Promise<void> {
    const filesArray = (Array.isArray(files) ? files : [files]).filter(
      (f) => f.type === "image" || f.type === "document"
    );
    
    if (filesArray.length === 0) {
      return;
    }

    // Ask backend registry which files are new/updated.
    try {
      const delta = await checkScanDelta(
        filesArray.map((f) => ({
          file_path: f.location,
          file_name: f.name,
          file_hash: f.fingerprint,
          file_type: f.type === "image" ? "image" : "document",
          last_modified: f.modifiedAt,
        }))
      );

      const allowedPaths = new Set(delta.queue.map((q) => q.file_path));
      const newFiles = filesArray.filter((f) => allowedPaths.has(f.location));

      this.emit("registry-stats", {
        total_files: delta.total_files,
        indexed: delta.indexed,
        pending: delta.pending,
        processing: delta.processing,
        failed: delta.failed,
      });

      if (newFiles.length === 0) {
        console.log(`[Queue] All ${filesArray.length} files already indexed, skipping enqueue`);
        this.emit("queue-size", this.state.items.length);
        return;
      }

      console.log(
        `[Queue] Delta scan: ${filesArray.length} files -> ${newFiles.length} queued (${delta.new_count} new, ${delta.updated_count} updated, ${delta.skipped_count} unchanged)`
      );

      this._enqueueInternal(newFiles);
    } catch (error) {
      console.warn("[Queue] Dedup check unavailable; falling back to local queue dedup:", error);
      this._enqueueInternal(filesArray);
      this.emit("queue-dedup-error", {
        count: filesArray.length,
        message: "Dedup endpoint unavailable. Falling back to local queue dedup.",
      });
    }
  }

  private _enqueueInternal(files: ScannableFile[]): void {
    if (files.length === 0) {
      return;
    }

    const existingKeys = new Set(
      this.state.items.map((i) => `${i.file.location}::${i.file.modifiedAt}`)
    );
    const dedupedFiles = files.filter(
      (file) => !existingKeys.has(`${file.location}::${file.modifiedAt}`)
    );

    if (dedupedFiles.length === 0) {
      return;
    }

    const newItems: QueueItem[] = dedupedFiles.map((file) => ({
      id: `${file.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      status: "pending",
      progress: 0,
      currentStep: "Queued",
      createdAt: Date.now(),
      error: undefined,
    }));

    this.state.items.push(...newItems);
    this.emit("queue-size", this.state.items.length);

    if (!this.running && !this.isAppPaused) {
      this.start();
    }

    this.checkpoint();
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.abortController = new AbortController();

    try {
      while (this.state.currentIndex < this.state.items.length && !this.abortController.signal.aborted) {
        if (this.isAppPaused) {
          await new Promise((resolve) => {
            const interval = setInterval(() => {
              if (!this.isAppPaused || this.abortController?.signal.aborted) {
                clearInterval(interval);
                resolve(undefined);
              }
            }, 500);
          });
        }

        const item = this.state.items[this.state.currentIndex];
        
        // Validate item exists and has required properties
        if (!item) {
          this.state.currentIndex++;
          continue;
        }
        
        if (!item.file || !item.file.uri) {
          item.status = "error";
          item.error = {
            code: "INVALID_FILE_DATA",
            message: "Item missing file or uri",
            retriable: false,
            retryCount: 0,
          };
          item.completedAt = Date.now();
          item.failedAt = item.completedAt;
          this.emitProgress(item);
          this.state.currentIndex++;
          continue;
        }
        
        
        try {
          // Add timeout to prevent infinite hanging on individual items
          const itemTimeoutMs = 10 * 60 * 1000; // 10 minute per item max
          const itemTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Item processing timeout")), itemTimeoutMs)
          );
          await Promise.race([this.processItem(item), itemTimeout]);
        } catch (itemError) {
          // Mark as error and continue to next item instead of stopping entire queue
          const currentItem = this.state.items[this.state.currentIndex];
          if (currentItem && currentItem.status !== "error" && currentItem.status !== "done") {
            currentItem.status = "error";
            currentItem.completedAt = Date.now();
            currentItem.failedAt = currentItem.completedAt;
            currentItem.error = {
              code: this.errorCode(itemError),
              message: itemError instanceof Error ? itemError.message : "Unknown error",
              retriable: false,
              retryCount: 0,
            };
            this.emitProgress(currentItem);
          }
        }
        
        this.state.currentIndex++;

        if (this.state.currentIndex % CHECKPOINT_INTERVAL === 0) {
          await this.checkpoint();
        }
      }

      this.running = false;
      this.emit("idle");
      await this.checkpoint();
    } catch (error) {
      this.running = false;
    }
  }

  private async processItem(item: QueueItem, retryCount = 0): Promise<void> {
    const maxRetries = 5;  // Increase retries for large batches
    const maxRetryDelay = 120000; // 2 minutes

    // Validate item before processing
    if (!item.file || !item.file.uri || !item.file.name) {
      throw new Error(`Invalid file data: missing uri or name for ${item.file?.name || 'unknown'}`);
    }

    try {
      // Ensure file is readable and has size (content:// URIs can report size 0)
      if (item.file.size <= 0 || item.file.uri.startsWith("content://")) {
        let cacheDir =
          (FileSystem as unknown as { cacheDirectory?: string }).cacheDirectory ||
          (FileSystem as unknown as { documentDirectory?: string }).documentDirectory;

        if (!cacheDir) {
          const pkg =
            (Constants as any)?.expoConfig?.android?.package ||
            (Constants as any)?.manifest?.android?.package ||
            "host.exp.exponent";
          if (Platform.OS === "android") {
            cacheDir = `file:///data/user/0/${pkg}/cache/`;
          }
        }

        if (!cacheDir) {
          throw new Error("No cache directory available for file normalization");
        }

        try {
          await makeDirectoryAsync(cacheDir, { intermediates: true });
        } catch {
          // Ignore if it already exists or can't create; copy will fail if unusable.
        }
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const targetPath = `${cacheDir}axyora-${item.id}-${Date.now()}-${safeName}`;
        try {
          await copyAsync({ from: item.file.uri, to: targetPath });
          const info = await getInfoAsync(targetPath);
          if (!info.exists || typeof info.size !== "number" || info.size <= 0) {
            throw new Error("Copied file has invalid size");
          }
          item.file.uri = targetPath;
          item.file.location = targetPath;
          item.file.size = info.size;
        } catch (err) {
          throw new Error(`Failed to normalize file for upload: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      item.status = "uploading";
      item.attemptedAt = Date.now();
      this.emitProgress(item);

      const submitted = await submitFileForProcessing({
        fileUri: item.file.uri,
        fileName: item.file.name,
        mimeType: item.file.mimeType,
        filePath: item.file.location,
        modifiedAt: item.file.modifiedAt,
      });

      if (!submitted || !submitted.jobId) {
        throw new Error("No job ID returned from server");
      }

      // Handle skipped files (already indexed)
      if (submitted.status === "skipped") {
        item.status = "done";
        item.completedAt = Date.now();
        item.processingTime = item.completedAt - (item.attemptedAt ?? item.createdAt);
        item.currentStep = "Skipped (already indexed)";
        this.emitProgress(item);
        this.state.currentIndex++;
        this.checkpoint();
        return;
      }

      item.jobId = submitted.jobId;
      item.status = "processing";
      this.emitProgress(item);

      // Poll job status with longer timeout for processing
      let isComplete = false;
      const startTime = Date.now();
      const timeoutMs = 5 * 60 * 1000; // 5 minute timeout for processing
      let pollAttempts = 0;
      let lastStatusUpdate = Date.now();
      const statusUpdateTimeoutMs = 30 * 1000; // 30 seconds - if no status update, assume stuck

      while (!isComplete && !this.abortController?.signal.aborted && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Check every 2 seconds

        try {
          pollAttempts++;
          const status = await getJobStatus(submitted.jobId);
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          
          if (!status || !status.status) {
            continue;
          }


          item.progress = status.progress || 0;
          item.currentStep = status.currentStep || "Processing";
          item.chunksProcessed = status.chunksProcessed || 0;
          lastStatusUpdate = Date.now();

          if (status.status === "done") {
            item.status = "done";
            item.completedAt = Date.now();
            item.processingTime = item.completedAt - (item.attemptedAt ?? item.createdAt);
            isComplete = true;
          } else if (status.status === "error") {
            throw new Error(`Backend job error: ${status.error || "Unknown error"}`);
          }
          // If status is "queued", "processing", "uploading", etc - continue polling

          this.emitProgress(item);
          
          // Check if job appears stuck (no progress updates)
          if (Date.now() - lastStatusUpdate > statusUpdateTimeoutMs && pollAttempts > 10) {
            // Don't fail yet, give it more time, but log warning
          }
        } catch (pollError) {
          // Don't throw on poll error - just continue trying
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Extra delay before retry
        }
      }

      if (!isComplete && Date.now() - startTime >= timeoutMs) {
        throw new Error(`Processing timeout after ${pollAttempts} polls (${Math.round((Date.now() - startTime) / 1000)}s)`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isRetriable = this.shouldRetry(error, retryCount);

      if (isRetriable && retryCount < maxRetries) {
        item.status = "retrying";
        item.error = {
          code: this.errorCode(error),
          message: errorMsg,
          retriable: true,
          retryCount: retryCount + 1,
        };

        // Exponential backoff with jitter for large batches
        const basedelay = 2000 * Math.pow(2, retryCount);
        const jitter = Math.random() * 1000;
        const delay = Math.min(basedelay + jitter, maxRetryDelay);
        this.emitProgress(item);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.processItem(item, retryCount + 1);
      } else {
        item.status = "error";
        item.completedAt = Date.now();
        item.failedAt = item.completedAt;
        item.error = {
          code: this.errorCode(error),
          message: errorMsg,
          retriable: false,
          retryCount,
        };
        item.retryCount = retryCount;
        this.emitProgress(item);
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= 5) return false; // Increased max attempts
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Retry on network, timeout, server errors, and service unavailability
      return (
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("cannot reach") ||
        msg.includes("econnrefused") ||
        msg.includes("500") ||      // HTTP 500 errors
        msg.includes("503") ||      // Service unavailable
        msg.includes("502") ||      // Bad gateway
        msg.includes("econnreset") ||
        msg.includes("socket hang up") ||
        msg.includes("request aborted")
      );
    }
    return true; // Retry unknown errors once
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes("network") || error.message.includes("Cannot reach"))
        return "NETWORK_ERROR";
      if (error.message.includes("timeout"))
        return "TIMEOUT";
      if (error.message.includes("500"))
        return "SERVER_ERROR";
      if (error.message.includes("503"))
        return "SERVICE_UNAVAILABLE";
      if (error.message.includes("too large"))
        return "FILE_TOO_LARGE";
      if (error.message.includes("unsupported"))
        return "UNSUPPORTED_FILE";
      if (error.message.includes("permission"))
        return "PERMISSION_DENIED";
    }
    return "UNKNOWN_ERROR";
  }

  private emitProgress(item: QueueItem): void {
    this.emit("progress", {
      id: item.id,
      file: item.file,
      status: item.status,
      progress: item.progress,
      step: item.currentStep,
      error: item.error,
      chunksProcessed: item.chunksProcessed,
    });
  }

  pause(): void {
    this.isAppPaused = true;
    this.emit("paused");
  }

  resume(): void {
    this.isAppPaused = false;
    this.emit("resumed");
    if (!this.running) {
      this.start();
    }
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.emit("stopped");
    this.checkpoint();
  }

  async checkpoint(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.state));
      this.state.lastCheckpoint = Date.now();
    } catch (error) {
    }
  }

  async clear(): Promise<void> {
    this.state.items = [];
    this.state.currentIndex = 0;
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
    this.emit("cleared");
  }

  getStats() {
    const items = this.state.items;
    return {
      total: items.length,
      done: items.filter((i) => i.status === "done").length,
      failed: items.filter((i) => i.status === "error").length,
      processing: items.filter((i) => i.status === "processing" || i.status === "uploading").length,
      pending: items.filter((i) => i.status === "pending").length,
      retrying: items.filter((i) => i.status === "retrying").length,
    };
  }

  getHistory(limit = 100) {
    return this.state.items.slice(-limit);
  }

  retryFailed(): void {
    const failed = this.state.items.filter((i) => i.status === "error");
    failed.forEach((item) => {
      item.status = "pending";
      item.error = undefined;
    });
    this.state.currentIndex = Math.min(
      this.state.currentIndex,
      this.state.items.indexOf(failed[0])
    );
    this.checkpoint();
    if (!this.running) {
      this.start();
    }
  }

  async retry(fileId: string): Promise<void> {
    const item = this.state.items.find((i) => i.id === fileId);
    if (!item) return;

    item.status = "pending";
    item.error = undefined;
    item.retryCount = (item.retryCount ?? 0) + 1;

    const index = this.state.items.indexOf(item);
    if (index >= 0) {
      this.state.currentIndex = Math.min(this.state.currentIndex, index);
    }

    await this.checkpoint();
    if (!this.running) {
      this.start();
    }
  }

  async remove(fileId: string): Promise<void> {
    const index = this.state.items.findIndex((i) => i.id === fileId);
    if (index === -1) return;

    this.state.items.splice(index, 1);

    if (this.state.currentIndex > index) {
      this.state.currentIndex = Math.max(0, this.state.currentIndex - 1);
    }

    this.emit("queue-size", this.state.items.length);
    await this.checkpoint();
  }
}

export const persistentQueue = new PersistentQueue();
