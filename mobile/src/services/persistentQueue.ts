/**
 * Persistent Queue with Automatic Recovery
 * Survives app restarts and resume/pause cycles
 * Stores queue state to AsyncStorage with job checkpoints
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import EventEmitter from "eventemitter3";

import { getJobStatus, submitFileForProcessing } from "./apiClient";
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
        this.state = { ...parsed, userId, processing: false };
        this.emit("queue-restored", {
          count: this.state.items.length,
          failedCount: this.state.items.filter((i) => i.status === "error").length,
        });
      }
    } catch (error) {
      console.error("[PersistentQueue] Failed to restore from storage", error);
    }
  }

  enqueue(files: ScannableFile | ScannableFile[]): void {
    const filesArray = Array.isArray(files) ? files : [files];
    const newItems: QueueItem[] = filesArray.map((file) => ({
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
      console.debug("[Queue] Already running, skipping start");
      return;
    }
    console.log(`[Queue] ▶️ Starting queue processing (${this.state.items.length} items, starting at index ${this.state.currentIndex})`);
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
        console.log(`[Queue] Processing item ${this.state.currentIndex + 1}/${this.state.items.length}: ${item.file.name}`);
        await this.processItem(item);
        this.state.currentIndex++;

        if (this.state.currentIndex % CHECKPOINT_INTERVAL === 0) {
          this.checkpoint();
        }
      }

      this.running = false;
      console.log(`[Queue] ⏹️ Queue processing complete or aborted`);
      this.emit("idle");
      this.checkpoint();
    } catch (error) {
      console.error("[Queue] 🚨 Error during processing", error instanceof Error ? error.message : error);
      this.running = false;
    }
  }

  private async processItem(item: QueueItem, retryCount = 0): Promise<void> {
    const maxRetries = 3;
    const maxRetryDelay = 60000; // 60s

    try {
      item.status = "uploading";
      item.attemptedAt = Date.now();
      console.log(`[Queue:ProcessItem] 📤 Uploading: ${item.file.name} (URI: ${item.file.uri.substring(0, 50)}...)`);
      this.emitProgress(item);

      const submitted = await submitFileForProcessing({
        fileUri: item.file.uri,
        fileName: item.file.name,
        mimeType: item.file.mimeType,
        filePath: item.file.location,
        modifiedAt: item.file.modifiedAt,
      });

      console.log(`[Queue:ProcessItem] ✅ Uploaded successfully, jobId: ${submitted.jobId}`);
      item.jobId = submitted.jobId;
      item.status = "processing";
      this.emitProgress(item);

      // Poll job status
      let isComplete = false;
      const startTime = Date.now();

      while (!isComplete && !this.abortController?.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1200));

        try {
          const status = await getJobStatus(submitted.jobId);

          item.progress = status.progress;
          item.currentStep = status.currentStep;
          item.chunksProcessed = status.chunksProcessed;

          if (status.status === "done") {
            item.status = "done";
            item.completedAt = Date.now();
            isComplete = true;
          } else if (status.status === "error") {
            throw new Error(status.error || "Job failed");
          }

          this.emitProgress(item);
        } catch (pollError) {
          if (retryCount < maxRetries) {
            throw pollError; // Retry at outer level
          }
          throw pollError;
        }
      }
    } catch (error) {
      const isRetriable = this.shouldRetry(error, retryCount);

      if (isRetriable && retryCount < maxRetries) {
        item.status = "retrying";
        item.error = {
          code: this.errorCode(error),
          message: error instanceof Error ? error.message : "Unknown error",
          retriable: true,
          retryCount: retryCount + 1,
        };

        const delay = Math.min(1000 * Math.pow(2, retryCount), maxRetryDelay);
        this.emitProgress(item);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.processItem(item, retryCount + 1);
      } else {
        item.status = "error";
        item.completedAt = Date.now();
        item.error = {
          code: this.errorCode(error),
          message: error instanceof Error ? error.message : "Unknown error",
          retriable: false,
          retryCount,
        };
        this.emitProgress(item);
      }
    }
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= 3) return false;
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("cannot reach") ||
        msg.includes("econnrefused")
      );
    }
    return true;
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes("network") || error.message.includes("Cannot reach"))
        return "NETWORK_ERROR";
      if (error.message.includes("timeout")) return "TIMEOUT";
      if (error.message.includes("too large")) return "FILE_TOO_LARGE";
      if (error.message.includes("unsupported")) return "UNSUPPORTED_FILE";
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
      console.error("[PersistentQueue] Failed to checkpoint", error);
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
}

export const persistentQueue = new PersistentQueue();
