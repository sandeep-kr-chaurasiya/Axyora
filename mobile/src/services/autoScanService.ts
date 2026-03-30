import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  requestAndroidStorageDirectoryAccess,
  requestScanPermissions,
  scanAppDocumentDirectory,
  type ScannableFile,
} from "./scannerService";

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
  try {
    let perms = await MediaLibrary.getPermissionsAsync(false, [
      "photo",
      "video",
      "audio",
    ]);
    console.log(`[MediaLibrary] Initial ${kind} permissions check:`, perms);

    if (!perms.granted) {
      console.log(`[MediaLibrary] Requesting ${kind} permissions...`);
      perms = await MediaLibrary.requestPermissionsAsync(false, [
        "photo",
        "video",
        "audio",
      ]);
      console.log(`[MediaLibrary] Permission request result:`, perms);
    }

    if (!perms.granted) {
      console.warn(`[MediaLibrary] ${kind} permissions not granted after request`);
      return [];
    }
  } catch (err) {
    console.error(`[MediaLibrary] Error requesting ${kind} permissions:`, err);
    return [];
  }

  const mediaType =
    kind === "image"
      ? [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video]
      : [MediaLibrary.MediaType.audio];

  const items: ScannableFile[] = [];
  let totalFetched = 0;
  let hasNextPage = true;
  let endCursor: string | undefined;

  try {
    console.log(`[MediaLibrary] Starting ${kind} asset scan with mediaType:`, mediaType);
    // Paginate through ALL assets (handle 800+ images)
    while (hasNextPage) {
      console.log(`[MediaLibrary] Fetching ${kind} page (cursor: ${endCursor || 'initial'})...`);
      const page = await MediaLibrary.getAssetsAsync({
        mediaType,
        first: 100, // Get 100 at a time for stability
        after: endCursor,
        sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
      });
      console.log(`[MediaLibrary] Page result: ${page.assets?.length || 0} assets, hasNextPage=${page.hasNextPage}, totalCount=${page.totalCount}`);

      if (!page.assets || page.assets.length === 0) {
        console.log(`[MediaLibrary] No assets in page, stopping scan`);
        hasNextPage = false;
        break;
      }
      console.log(`[MediaLibrary] Processing ${page.assets.length} ${kind} assets...`);

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

          // Report progress every 50 files
          if (totalFetched % 50 === 0 && onProgress) {
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

      // Check if there are more pages
      endCursor = page.endCursor;
      hasNextPage = page.hasNextPage || false;
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

    console.log(`[AutoScan] ✅ Found ${totalFetched} ${kind}s total`);
  } catch (err) {
    console.error(`[AutoScan] ❌ Error scanning ${kind} assets:`, err instanceof Error ? err.message : err);
    // Continue gracefully instead of failing
  }

  return items;
}

async function scanDocuments(): Promise<ScannableFile[]> {
  return scanAppDocumentDirectory(300);
}

export async function runAutoScan(
  onProgress?: (p: AutoScanProgress) => void,
  onComplete?: (files: ScannableFile[]) => void
): Promise<ScannableFile[]> {
  console.log("\n\n========== [AutoScan] STARTING AUTO-SCAN ==========");
  const allFiles: ScannableFile[] = [];
  let mediaAllowed = true;
  let safAccess = false;

  try {
    // Request SAF directory access FIRST and wait for result
    if (Platform.OS === "android") {
      console.log("[AutoScan] 📁 Requesting Android Storage Access Framework...");
      const safResult = await requestAndroidStorageDirectoryAccess();
      safAccess = safResult.granted;
      console.log(`[AutoScan] 📁 SAF access result: ${safAccess ? '✅ granted' : '❌ denied'}`);
    }

    // Request permissions BEFORE starting scans
    console.log("[AutoScan] 🔐 Requesting media permissions...");
    try {
      const perms = await requestScanPermissions();
      mediaAllowed = perms.mediaGranted;
      console.log(`[AutoScan] 🔐 Media permissions: ${mediaAllowed ? '✅ granted' : '❌ denied'}`);
    } catch (permErr) {
      console.warn("[AutoScan] 🔐 Permission request failed:", permErr);
      mediaAllowed = false;
    }

    // Phase 1: Images from MediaLibrary
    console.log("\n[AutoScan] 📸 Phase 1: Starting image scan...");
    await updateAutoScanState({ status: "scanning", phase: "images" });
    if (mediaAllowed) {
      try {
        const images = await getMediaAssets("image", onProgress);
        console.log(`[AutoScan] 📸 Found ${images.length} images`);
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
        console.error("[AutoScan] 📸 Image scanning failed:", imgErr instanceof Error ? imgErr.message : imgErr);
      }
    } else {
      console.warn("[AutoScan] 📸 Media permissions not granted, skipping MediaLibrary images");
      if (onProgress) {
        onProgress({
          phase: "images",
          current: 0,
          total: 0,
          status: "indexing",
        });
      }
    }

    // Phase 2: Audio from MediaLibrary
    console.log("\n[AutoScan] 🎵 Phase 2: Starting audio scan...");
    await updateAutoScanState({ status: "scanning", phase: "audio" });
    if (mediaAllowed) {
      try {
        const audio = await getMediaAssets("audio", onProgress);
        console.log(`[AutoScan] 🎵 Found ${audio.length} audio files`);
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
        console.error("[AutoScan] 🎵 Audio scanning failed:", audioErr instanceof Error ? audioErr.message : audioErr);
      }
    } else {
      console.warn("[AutoScan] 🎵 Media permissions not granted, skipping MediaLibrary audio");
      if (onProgress) {
        onProgress({
          phase: "audio",
          current: 0,
          total: 0,
          status: "indexing",
        });
      }
    }

    // Phase 3: Documents (comprehensive file scan including public folders + SAF)
    console.log("\n[AutoScan] 📄 Phase 3: Starting document & comprehensive file scan...");
    await updateAutoScanState({ status: "scanning", phase: "documents" });
    try {
      // Scan with increased file limit (300) to capture as much as possible
      const docs = await scanDocuments();
      console.log(`[AutoScan] 📄 Found ${docs.length} documents/files`);
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
      console.warn("[AutoScan] Document scanning failed, continuing:", docErr);
    }

    // Complete
    const totalCount = allFiles.length;
    console.log(`[AutoScan] Complete! Found ${totalCount} total files to index`);
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
