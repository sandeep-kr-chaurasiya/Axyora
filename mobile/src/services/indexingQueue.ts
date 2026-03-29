import AsyncStorage from "@react-native-async-storage/async-storage";
import EventEmitter from "eventemitter3";

import { getJobStatus, submitFileForProcessing } from "./apiClient";
import type { ScannableFile } from "./scannerService";

export interface QueueProgressEvent {
  file: ScannableFile;
  status: "queued" | "processing" | "done" | "error" | "skipped";
  progress: number;
  step: string;
  chunksProcessed?: number;
  error?: string;
}

const INDEXED_KEY = "@axyora/indexed-fingerprints";

class IndexingQueue extends EventEmitter {
  private running = false;
  private jobs: ScannableFile[] = [];

  enqueue(files: ScannableFile[]) {
    this.jobs.push(...files);
    this.emit("queue-size", this.jobs.length);
    if (!this.running) {
      this.start();
    }
  }

  private async start() {
    this.running = true;
    while (this.jobs.length > 0) {
      const file = this.jobs.shift()!;
      await this.processFile(file);
      this.emit("queue-size", this.jobs.length);
    }
    this.running = false;
    this.emit("idle");
  }

  private async processFile(file: ScannableFile) {
    const alreadyIndexed = await this.isFingerprintIndexed(file.fingerprint);
    if (alreadyIndexed) {
      this.emit("progress", {
        file,
        status: "skipped",
        progress: 100,
        step: "Building memory... (cached)",
      } satisfies QueueProgressEvent);
      return;
    }

    this.emit("progress", {
      file,
      status: "queued",
      progress: 0,
      step: "Scanning files...",
    } satisfies QueueProgressEvent);

    try {
      const submitted = await submitFileForProcessing({
        fileUri: file.uri,
        fileName: file.name,
        mimeType: file.mimeType,
        filePath: file.location,
        modifiedAt: file.modifiedAt,
      });

      let isComplete = false;
      while (!isComplete) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const status = await getJobStatus(submitted.jobId);

        this.emit("progress", {
          file,
          status: status.status,
          progress: status.progress,
          step: status.currentStep,
          chunksProcessed: status.chunksProcessed,
          error: status.error || undefined,
        } satisfies QueueProgressEvent);

        if (status.status === "done") {
          isComplete = true;
          await this.markFingerprintIndexed(file.fingerprint);
        }

        if (status.status === "error") {
          isComplete = true;
        }
      }
    } catch (error) {
      this.emit("progress", {
        file,
        status: "error",
        progress: 0,
        step: "Failed",
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies QueueProgressEvent);
    }
  }

  private async isFingerprintIndexed(fingerprint: string): Promise<boolean> {
    const raw = await AsyncStorage.getItem(INDEXED_KEY);
    if (!raw) {
      return false;
    }
    const map = JSON.parse(raw) as Record<string, true>;
    return Boolean(map[fingerprint]);
  }

  private async markFingerprintIndexed(fingerprint: string): Promise<void> {
    const raw = await AsyncStorage.getItem(INDEXED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, true>) : {};
    map[fingerprint] = true;
    await AsyncStorage.setItem(INDEXED_KEY, JSON.stringify(map));
  }
}

export const indexingQueue = new IndexingQueue();
