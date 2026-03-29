import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ScannableFile } from "./scannerService";

const AUTO_SCAN_KEY = "@axyora_auto_scan_state";
const AUTO_SCAN_STATUS_KEY = "@axyora_auto_scan_status";

export interface AutoScanState {
  lastScanned: number; // timestamp
  scannedCount: number;
  totalCount: number;
  status: "idle" | "scanning" | "indexing" | "complete";
  phase: "images" | "audio" | "documents" | "complete";
}

export interface AutoScanProgress {
  phase: "images" | "audio" | "documents" | "complete";
  current: number;
  total: number;
  status: "scanning" | "indexing" | "complete";
}

export async function getAutoScanState(): Promise<AutoScanState> {
  try {
    const stored = await AsyncStorage.getItem(AUTO_SCAN_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to get auto scan state", e);
  }

  return {
    lastScanned: 0,
    scannedCount: 0,
    totalCount: 0,
    status: "idle",
    phase: "images",
  };
}

export async function updateAutoScanState(partialState: Partial<AutoScanState>) {
  try {
    const current = await getAutoScanState();
    const updated = { ...current, ...partialState };
    await AsyncStorage.setItem(AUTO_SCAN_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to update auto scan state", e);
  }
}

async function getMediaAssets(
  kind: "image" | "audio",
  onProgress?: (p: AutoScanProgress) => void
): Promise<ScannableFile[]> {
  const mediaType =
    kind === "image"
      ? [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video]
      : [MediaLibrary.MediaType.audio];

  const items: ScannableFile[] = [];
  let totalFetched = 0;

  try {
    // Try to get all assets in one call (simplified approach)
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first: 1000, // Request up to 1000 assets at once
      sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
    });

    if (page.assets && page.assets.length > 0) {
      for (let i = 0; i < page.assets.length; i++) {
        const asset = page.assets[i];
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
          const resolvedUri = assetInfo.localUri || asset.uri;

          if (!resolvedUri || (!resolvedUri.startsWith("file://") && !resolvedUri.startsWith("content://"))) {
            continue;
          }

          const mimeType = kind === "audio" ? "audio/mpeg" : "image/jpeg";
          const modifiedAt = Number(asset.modificationTime ?? Date.now());
          const size = Number((asset as unknown as { fileSize?: number }).fileSize ?? 0);

          items.push({
            id: asset.id,
            uri: resolvedUri,
            name: asset.filename || `${kind}_${totalFetched}`,
            mimeType,
            type: kind,
            size,
            modifiedAt,
            location: resolvedUri,
            fingerprint: `${resolvedUri}::${size}::${modifiedAt}`,
          });

          totalFetched++;

          // Report progress every 20 files
          if (totalFetched % 20 === 0 && onProgress) {
            onProgress({
              phase: kind === "image" ? "images" : "audio",
              current: totalFetched,
              total: page.totalCount || totalFetched,
              status: "scanning",
            });
          }
        } catch (assetErr) {
          console.warn(`Failed to process ${kind} asset:`, assetErr);
          continue;
        }
      }
    }

    // Report final count
    if (totalFetched > 0 && onProgress) {
      onProgress({
        phase: kind === "image" ? "images" : "audio",
        current: totalFetched,
        total: totalFetched,
        status: "scanning",
      });
    }
  } catch (err) {
    console.warn(`Error scanning ${kind} assets:`, err);
    // Continue gracefully instead of failing
  }

  return items;
}

async function scanDocuments(): Promise<ScannableFile[]> {
  const items: ScannableFile[] = [];
  
  // Scan Documents directory
  const docsDir = FileSystem.documentDirectory;
  if (docsDir) {
    try {
      const files = await FileSystem.readDirectoryAsync(docsDir);
      const supportedExts = ["pdf", "doc", "docx", "txt"];

      for (const file of files) {
        const ext = file.split(".").pop()?.toLowerCase();
        if (!supportedExts.includes(ext || "")) continue;

        const fileUri = docsDir + file;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (!fileInfo.exists || fileInfo.isDirectory) continue;

        const mimeType = ext === "pdf" ? "application/pdf" : "text/plain";

        items.push({
          id: `doc_${file}`,
          uri: fileUri,
          name: file,
          mimeType,
          type: "document",
          size: fileInfo.size || 0,
          modifiedAt: fileInfo.modificationTime ? fileInfo.modificationTime * 1000 : Date.now(),
          location: fileUri,
          fingerprint: `${fileUri}::${fileInfo.size}::${fileInfo.modificationTime || Date.now()}`,
        });
      }
    } catch (e) {
      console.warn("Failed to scan documents directory", e);
    }
  }

  return items;
}

export async function runAutoScan(
  onProgress?: (p: AutoScanProgress) => void,
  onComplete?: (files: ScannableFile[]) => void
): Promise<ScannableFile[]> {
  const allFiles: ScannableFile[] = [];

  try {
    // Phase 1: Images
    await updateAutoScanState({ status: "scanning", phase: "images" });
    try {
      const images = await getMediaAssets("image", onProgress);
      allFiles.push(...images);

      if (onProgress) {
        onProgress({
          phase: "images",
          current: images.length,
          total: images.length,
          status: "indexing",
        });
      }
    } catch (imgErr) {
      console.warn("Image scanning failed, continuing:", imgErr);
      // Continue to next phase on error
    }

    // Phase 2: Audio
    await updateAutoScanState({ status: "scanning", phase: "audio" });
    try {
      const audio = await getMediaAssets("audio", onProgress);
      allFiles.push(...audio);

      if (onProgress) {
        onProgress({
          phase: "audio",
          current: audio.length,
          total: audio.length,
          status: "indexing",
        });
      }
    } catch (audioErr) {
      console.warn("Audio scanning failed, continuing:", audioErr);
      // Continue to next phase on error
    }

    // Phase 3: Documents
    await updateAutoScanState({ status: "scanning", phase: "documents" });
    try {
      const docs = await scanDocuments();
      allFiles.push(...docs);

      if (onProgress) {
        onProgress({
          phase: "documents",
          current: docs.length,
          total: docs.length,
          status: "indexing",
        });
      }
    } catch (docErr) {
      console.warn("Document scanning failed, continuing:", docErr);
      // Continue even if document scanning fails
    }

    // Complete
    await updateAutoScanState({
      status: "complete",
      phase: "complete",
      lastScanned: Date.now(),
      scannedCount: allFiles.length,
      totalCount: allFiles.length,
    });

    if (onProgress) {
      onProgress({
        phase: "complete",
        current: allFiles.length,
        total: allFiles.length,
        status: "complete",
      });
    }

    if (onComplete) {
      onComplete(allFiles);
    }

    return allFiles;
  } catch (error) {
    console.error("Auto scan fatal error", error);
    // Mark as complete even on fatal error to unblock user
    await updateAutoScanState({ status: "complete", phase: "complete" });
    
    if (onProgress) {
      onProgress({
        phase: "complete",
        current: allFiles.length,
        total: allFiles.length,
        status: "complete",
      });
    }
    
    // Return whatever files we managed to collect
    return allFiles;
  }
}

export async function shouldShowAutoScan(): Promise<boolean> {
  const state = await getAutoScanState();
  // Show if:
  // 1. Never scanned before (lastScanned === 0)
  // 2. Scan failed or incomplete (status !== "complete")
  return state.lastScanned === 0 || state.status !== "complete";
}
