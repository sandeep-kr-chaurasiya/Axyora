/**
 * Local Storage Manager - Ensures all device data is stored locally first
 * before moving to indexing or extraction
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

enum StorageKeys {
  DEVICE_FILES = 'AXYORA_DEVICE_FILES',
  PROCESSING_QUEUE = 'AXYORA_PROCESSING_QUEUE',
  USER_SETTINGS = 'AXYORA_USER_SETTINGS',
  INDEX_STATUS = 'AXYORA_INDEX_STATUS',
  FAILED_FILES = 'AXYORA_FAILED_FILES',
  LOCAL_CACHE = 'AXYORA_LOCAL_CACHE',
}

interface LocalFile {
  id: string;
  name: string;
  path: string;
  uri: string;
  type: 'image' | 'video' | 'document' | 'audio';
  size: number;
  mimeType: string;
  hash: string; // SHA-256 for deduplication
  discoveredAt: number;
  indexed: boolean;
  indexedAt?: number;
}

interface ProcessingQueueItem {
  id: string;
  fileId: string;
  status: 'pending' | 'storing' | 'indexing' | 'complete' | 'failed';
  progress: number;
  error?: string;
  addedAt: number;
  completedAt?: number;
}

interface StorageMetadata {
  totalFiles: number;
  totalSize: number;
  lastSyncAt: number;
  indexProgress: number;
}

export class LocalStorageManager {
  private static instance: LocalStorageManager;

  private constructor() {}

  static getInstance(): LocalStorageManager {
    if (!LocalStorageManager.instance) {
      LocalStorageManager.instance = new LocalStorageManager();
    }
    return LocalStorageManager.instance;
  }

  /**
   * Stage 1: Store all discovered files locally FIRST
   */
  async storeDiscoveredFiles(files: LocalFile[]): Promise<void> {
    try {
      const existing = await this.getDiscoveredFiles();
      
      // Deduplicate by hash
      const hashMap = new Map(existing.map(f => [f.hash, f]));
      const newFiles = files.filter(f => {
        if (hashMap.has(f.hash)) {
          // Already exists, update only if newer discovery time
          const existing = hashMap.get(f.hash)!;
          if (f.discoveredAt > existing.discoveredAt) {
            hashMap.set(f.hash, f);
          }
          return false;
        }
        hashMap.set(f.hash, f);
        return true;
      });

      const allFiles = Array.from(hashMap.values());
      await AsyncStorage.setItem(
        StorageKeys.DEVICE_FILES,
        JSON.stringify(allFiles)
      );

      // Update metadata
      const metadata = await this.getMetadata();
      metadata.totalFiles = allFiles.length;
      metadata.totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
      metadata.lastSyncAt = Date.now();
      
      await AsyncStorage.setItem(
        StorageKeys.INDEX_STATUS,
        JSON.stringify(metadata)
      );

      console.log(`[LocalStorage] Stored ${allFiles.length} files locally (${newFiles.length} new)`);
    } catch (error) {
      console.error('[LocalStorage] Failed to store discovered files', error);
      throw error;
    }
  }

  /**
   * Stage 2: Move files to processing queue (for indexing/extraction)
   */
  async queueFilesForProcessing(fileIds: string[]): Promise<void> {
    try {
      const files = await this.getDiscoveredFiles();
      const filesToQueue = files.filter(f => fileIds.includes(f.id) && !f.indexed);

      const queueItems: ProcessingQueueItem[] = filesToQueue.map(f => ({
        id: `${f.id}-${Date.now()}`,
        fileId: f.id,
        status: 'pending',
        progress: 0,
        addedAt: Date.now(),
      }));

      const existingQueue = await this.getProcessingQueue();
      const updatedQueue = [...existingQueue, ...queueItems];

      await AsyncStorage.setItem(
        StorageKeys.PROCESSING_QUEUE,
        JSON.stringify(updatedQueue)
      );

      console.log(`[LocalStorage] Queued ${queueItems.length} files for processing`);
    } catch (error) {
      console.error('[LocalStorage] Failed to queue files', error);
      throw error;
    }
  }

  /**
   * Stage 3: Update processing status
   */
  async updateProcessingStatus(
    queueItemId: string,
    status: ProcessingQueueItem['status'],
    progress?: number,
    error?: string
  ): Promise<void> {
    try {
      const queue = await this.getProcessingQueue();
      const item = queue.find(i => i.id === queueItemId);

      if (item) {
        item.status = status;
        if (progress !== undefined) item.progress = progress;
        if (error) item.error = error;
        if (status === 'complete' || status === 'failed') {
          item.completedAt = Date.now();
        }

        // Mark file as indexed if complete
        if (status === 'complete') {
          const files = await this.getDiscoveredFiles();
          const file = files.find(f => f.id === item.fileId);
          if (file) {
            file.indexed = true;
            file.indexedAt = Date.now();
            await AsyncStorage.setItem(
              StorageKeys.DEVICE_FILES,
              JSON.stringify(files)
            );
          }
        }

        await AsyncStorage.setItem(
          StorageKeys.PROCESSING_QUEUE,
          JSON.stringify(queue)
        );
      }
    } catch (error) {
      console.error('[LocalStorage] Failed to update processing status', error);
    }
  }

  /**
   * Retrieve all locally stored files
   */
  async getDiscoveredFiles(): Promise<LocalFile[]> {
    try {
      const data = await AsyncStorage.getItem(StorageKeys.DEVICE_FILES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to get discovered files', error);
      return [];
    }
  }

  /**
   * Retrieve processing queue
   */
  async getProcessingQueue(): Promise<ProcessingQueueItem[]> {
    try {
      const data = await AsyncStorage.getItem(StorageKeys.PROCESSING_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to get processing queue', error);
      return [];
    }
  }

  /**
   * Get storage metadata
   */
  async getMetadata(): Promise<StorageMetadata> {
    try {
      const data = await AsyncStorage.getItem(StorageKeys.INDEX_STATUS);
      return data
        ? JSON.parse(data)
        : {
            totalFiles: 0,
            totalSize: 0,
            lastSyncAt: 0,
            indexProgress: 0,
          };
    } catch (error) {
      console.error('[LocalStorage] Failed to get metadata', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        lastSyncAt: 0,
        indexProgress: 0,
      };
    }
  }

  /**
   * Get indexing progress
   */
  async getProgress(): Promise<{
    total: number;
    indexed: number;
    pending: number;
    processing: number;
    failed: number;
    percentComplete: number;
  }> {
    try {
      const files = await this.getDiscoveredFiles();
      const queue = await this.getProcessingQueue();

      const indexed = files.filter(f => f.indexed).length;
      const total = files.length;
      const pending = queue.filter(i => i.status === 'pending').length;
      const processing = queue.filter(i => i.status === 'storing' || i.status === 'indexing').length;
      const failed = queue.filter(i => i.status === 'failed').length;

      return {
        total,
        indexed,
        pending,
        processing,
        failed,
        percentComplete: total > 0 ? Math.round((indexed / total) * 100) : 0,
      };
    } catch (error) {
      console.error('[LocalStorage] Failed to get progress', error);
      return { total: 0, indexed: 0, pending: 0, processing: 0, failed: 0, percentComplete: 0 };
    }
  }

  /**
   * Clear all local data
   */
  async clearAll(): Promise<void> {
    try {
      const keys = Object.values(StorageKeys);
      await AsyncStorage.multiRemove(keys);
      console.log('[LocalStorage] All local data cleared');
    } catch (error) {
      console.error('[LocalStorage] Failed to clear local data', error);
      throw error;
    }
  }

  /**
   * Export local database (for backup/debugging)
   */
  async exportDatabase(): Promise<{
    files: LocalFile[];
    queue: ProcessingQueueItem[];
    metadata: StorageMetadata;
  }> {
    try {
      const [files, queue, metadata] = await Promise.all([
        this.getDiscoveredFiles(),
        this.getProcessingQueue(),
        this.getMetadata(),
      ]);

      return { files, queue, metadata };
    } catch (error) {
      console.error('[LocalStorage] Failed to export database', error);
      throw error;
    }
  }
}

export const localStorageManager = LocalStorageManager.getInstance();
