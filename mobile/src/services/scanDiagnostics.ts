/**
 * Diagnostic utilities for Android auto-scan troubleshooting
 * Use these functions to verify scan results and diagnose issues
 */

import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface ScanDiagnostics {
  timestamp: number;
  platform: string;
  permissionStatus: {
    media: boolean;
    storage: boolean;
  };
  safAccess: boolean;
  folderAccessabilty: Record<string, { exists: boolean; readable: boolean }>;
  mediaLibraryStatus: {
    photoCount: number;
    audioCount: number;
    totalCount: number;
  };
  documentScanStatus: {
    docsFound: number;
    extensionsDetected: string[];
  };
  autoScanState: {
    lastScanned: number;
    totalCount: number;
    status: string;
  };
}

/**
 * Run comprehensive diagnostics to verify auto-scan functionality
 * Call this after permissions are granted to debug issues
 */
export async function runScanDiagnostics(): Promise<ScanDiagnostics> {
  const diagnostics: ScanDiagnostics = {
    timestamp: Date.now(),
    platform: Platform.OS,
    permissionStatus: {
      media: false,
      storage: false,
    },
    safAccess: false,
    folderAccessabilty: {},
    mediaLibraryStatus: {
      photoCount: 0,
      audioCount: 0,
      totalCount: 0,
    },
    documentScanStatus: {
      docsFound: 0,
      extensionsDetected: [],
    },
    autoScanState: {
      lastScanned: 0,
      totalCount: 0,
      status: "unknown",
    },
  };

  // Check permission status
  try {
    const mediaPerms = await MediaLibrary.getPermissionsAsync(false, [
      "photo",
      "video",
      "audio",
    ]);
    diagnostics.permissionStatus.media = mediaPerms.granted;
    console.log(
      `[Diagnostics] MediaLibrary permissions: ${mediaPerms.granted ? "✅ Granted" : "❌ Denied"}`
    );
  } catch (err) {
    console.warn(
      `[Diagnostics] Failed to check MediaLibrary permissions:`,
      err
    );
  }

  // Check SAF access
  if (Platform.OS === "android") {
    try {
      const savedUri = await AsyncStorage.getItem("@axyora/android-directory-uri");
      diagnostics.safAccess = !!savedUri;
      console.log(
        `[Diagnostics] SAF access stored: ${savedUri ? "✅ Yes" : "❌ No"}`
      );
    } catch (err) {
      console.warn(`[Diagnostics] Failed to check SAF status:`, err);
    }
  }

  // Test folder accessibility
  const folderPaths = [
    "file:///storage/emulated/0/DCIM/",
    "file:///storage/emulated/0/Pictures/",
    "file:///storage/emulated/0/Download/",
    "file:///storage/emulated/0/Documents/",
    "file:///storage/emulated/0/Music/",
    "file:///storage/emulated/0/Podcasts/",
    "file:///storage/emulated/0/Recordings/",
    "file:///storage/emulated/0/Movies/",
  ];

  for (const path of folderPaths) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      diagnostics.folderAccessabilty[path] = {
        exists: info.exists,
        readable: info.exists && !!info.isDirectory,
      };
    } catch (err) {
      diagnostics.folderAccessabilty[path] = {
        exists: false,
        readable: false,
      };
    }
  }

  // Try MediaLibrary photo count
  try {
    const photosPage = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      first: 1,
    });
    diagnostics.mediaLibraryStatus.photoCount = photosPage.totalCount || 0;
    console.log(
      `[Diagnostics] MediaLibrary photo/video total: ${diagnostics.mediaLibraryStatus.photoCount}`
    );
  } catch (err) {
    console.warn(`[Diagnostics] Failed to count photos:`, err);
  }

  // Try MediaLibrary audio count
  try {
    const audioPage = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.audio],
      first: 1,
    });
    diagnostics.mediaLibraryStatus.audioCount = audioPage.totalCount || 0;
    console.log(
      `[Diagnostics] MediaLibrary audio total: ${diagnostics.mediaLibraryStatus.audioCount}`
    );
  } catch (err) {
    console.warn(`[Diagnostics] Failed to count audio:`, err);
  }

  diagnostics.mediaLibraryStatus.totalCount =
    diagnostics.mediaLibraryStatus.photoCount +
    diagnostics.mediaLibraryStatus.audioCount;

  // Retrieve stored auto-scan state
  try {
    const scanState = await AsyncStorage.getItem("@axyora_auto_scan_state");
    if (scanState) {
      const parsed = JSON.parse(scanState);
      diagnostics.autoScanState = {
        lastScanned: parsed.lastScanned || 0,
        totalCount: parsed.totalCount || 0,
        status: parsed.status || "unknown",
      };
      console.log(
        `[Diagnostics] Auto-scan state: ${diagnostics.autoScanState.status} (${diagnostics.autoScanState.totalCount} files)`
      );
    }
  } catch (err) {
    console.warn(`[Diagnostics] Failed to retrieve scan state:`, err);
  }

  return diagnostics;
}

/**
 * Print formatted diagnostic report to console
 */
export function printDiagnosticReport(diagnostics: ScanDiagnostics): void {
  console.log("========== AXYORA AUTO-SCAN DIAGNOSTICS ==========");
  console.log(`Timestamp: ${new Date(diagnostics.timestamp).toISOString()}`);
  console.log(`Platform: ${diagnostics.platform}`);
  console.log("--- PERMISSIONS ---");
  console.log(
    `MediaLibrary: ${diagnostics.permissionStatus.media ? "✅" : "❌"}`
  );
  console.log(
    `Storage: ${diagnostics.permissionStatus.storage ? "✅" : "❌"}`
  );
  if (diagnostics.platform === "android") {
    console.log(`SAF Access: ${diagnostics.safAccess ? "✅" : "❌"}`);
  }
  console.log("--- FOLDER ACCESSIBILITY ---");
  Object.entries(diagnostics.folderAccessabilty).forEach(([path, status]) => {
    const pathShort = path.split("/")[4] || path;
    console.log(
      `${pathShort.padEnd(15)}: exists=${status.exists ? "✅" : "❌"}, readable=${status.readable ? "✅" : "❌"}`
    );
  });
  console.log("--- MediaLibrary COUNTS ---");
  console.log(
    `Photos/Videos: ${diagnostics.mediaLibraryStatus.photoCount}`
  );
  console.log(`Audio: ${diagnostics.mediaLibraryStatus.audioCount}`);
  console.log(`Total: ${diagnostics.mediaLibraryStatus.totalCount}`);
  console.log("--- AUTO-SCAN STATE ---");
  console.log(`Status: ${diagnostics.autoScanState.status}`);
  console.log(`Total Files Found: ${diagnostics.autoScanState.totalCount}`);
  console.log(
    `Last Scanned: ${diagnostics.autoScanState.lastScanned ? new Date(diagnostics.autoScanState.lastScanned).toISOString() : "Never"}`
  );
  console.log("=================================================");
}

/**
 * Get human-readable troubleshooting advice based on diagnostics
 */
export function getTroubleshootingAdvice(
  diagnostics: ScanDiagnostics
): string[] {
  const advice: string[] = [];

  if (
    !diagnostics.permissionStatus.media &&
    diagnostics.platform === "android"
  ) {
    advice.push(
      "❌ MediaLibrary permissions not granted. Make sure you tap 'Allow' when prompted."
    );
  }

  if (
    diagnostics.platform === "android" &&
    !diagnostics.safAccess &&
    diagnostics.mediaLibraryStatus.totalCount === 0
  ) {
    advice.push(
      "⚠️ SAF (Storage Access Framework) not enabled. Tap 'Allow' when prompted to access additional folders."
    );
  }

  const inaccessibleFolders = Object.entries(
    diagnostics.folderAccessabilty
  )
    .filter(([_, status]) => !status.readable)
    .map(([path, _]) => path.split("/")[4] || path);

  if (inaccessibleFolders.length > 0) {
    advice.push(
      `⚠️ Cannot access folders: ${inaccessibleFolders.join(", ")}. This is normal on Android 13+.`
    );
  }

  if (
    diagnostics.mediaLibraryStatus.totalCount === 0 &&
    diagnostics.autoScanState.totalCount === 0
  ) {
    advice.push(
      "⚠️ No files found. Check that your device has photos, audio, or documents to scan."
    );
  }

  if (
    diagnostics.autoScanState.status === "complete" &&
    diagnostics.autoScanState.totalCount > 0
  ) {
    advice.push(
      `✅ Auto-scan completed successfully. ${diagnostics.autoScanState.totalCount} files indexed and ready to search.`
    );
  }

  if (advice.length === 0) {
    advice.push("✅ All checks passed! Try running auto-scan again.");
  }

  return advice;
}
