import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { getInfoAsync, readDirectoryAsync } from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

export type ScanType = "document" | "image" | "audio";

export interface ScannableFile {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  type: ScanType;
  size: number;
  modifiedAt: number;
  location: string;
  fingerprint: string;
}

const ANDROID_DIRECTORY_URI_KEY = "@axyora/android-directory-uri";

function extToMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc" || ext === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === "txt") return "text/plain";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "wav") return "audio/wav";
  return "application/octet-stream";
}

function fileTypeFromMime(mime: string): ScanType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function buildFingerprint(path: string, size: number, modifiedAt: number): string {
  return `${path}::${size}::${modifiedAt}`;
}

async function getFileSizeAsync(uri: string): Promise<number> {
  try {
    // Try new API first (might be available)
    if ((FileSystem as any).getInfoAsync) {
      const info = await getInfoAsync(uri);
      if (info?.exists && typeof info.size === 'number') {
        return info.size;
      }
    }
  } catch (e) {
}
  
  // Fallback: return 0 and let backend handle it
  // This prevents blocking on deprecated API calls
  return 0;
}

function isUploadableUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("content://");
}

function getPickerAssetUri(asset: DocumentPicker.DocumentPickerAsset): string {
  const fileCopyUri = (asset as unknown as { fileCopyUri?: string }).fileCopyUri;
  return fileCopyUri || asset.uri;
}

export async function requestAndroidStorageDirectoryAccess(): Promise<{
  granted: boolean;
  directoryUri?: string;
}> {
  if (Platform.OS !== "android") {
    return { granted: false };
  }

  const saf = (FileSystem as any).StorageAccessFramework;
  if (!saf?.requestDirectoryPermissionsAsync) {
    return { granted: false };
  }

  try {
    const result = await saf.requestDirectoryPermissionsAsync();
    if (result?.granted && result?.directoryUri) {
      await AsyncStorage.setItem(ANDROID_DIRECTORY_URI_KEY, result.directoryUri);
      return { granted: true, directoryUri: result.directoryUri };
    }
  } catch {
    // Ignore prompt failures; caller can proceed with app sandbox scan.
  }

  return { granted: false };
}

async function getStoredAndroidDirectoryUri(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ANDROID_DIRECTORY_URI_KEY);
  } catch {
    return null;
  }
}

export async function requestScanPermissions(): Promise<{
  mediaGranted: boolean;
  runtimeLimited: boolean;
}> {
  let media:
    | {
        granted?: boolean;
        accessPrivileges?: string;
      }
    | undefined;
  let runtimeLimited = false;
  try {
    media = await MediaLibrary.requestPermissionsAsync(false, [
      "photo",
      "video",
      "audio",
    ]);
  } catch {
    try {
      media = await MediaLibrary.getPermissionsAsync(false, [
        "photo",
        "video",
        "audio",
      ]);
    } catch {
      media = { granted: false, accessPrivileges: "none" };
      runtimeLimited = true;
    }
  }
  return {
    mediaGranted:
      media.granted === true ||
      (typeof media.accessPrivileges === "string" && media.accessPrivileges.indexOf("all") >= 0),
    runtimeLimited,
  };
}

export async function pickDocuments(): Promise<ScannableFile[]> {
  const picked = await DocumentPicker.getDocumentAsync({
    multiple: true,
    type: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/*",
      "audio/*",
    ],
    // Ensures iOS providers return an uploadable local file URI.
    copyToCacheDirectory: true,
  });

  if (picked.canceled) {
    return [];
  }

  const files: ScannableFile[] = [];
  
  for (const asset of picked.assets) {
    const resolvedUri = getPickerAssetUri(asset);
    if (!isUploadableUri(resolvedUri)) {
      continue;
    }

    const fileSize = await getFileSizeAsync(resolvedUri);

    const mimeType = asset.mimeType || extToMime(asset.name);
    const modifiedAt = Date.now();
    files.push({
      id: `${resolvedUri}-${fileSize}`,
      uri: resolvedUri,
      name: asset.name,
      mimeType,
      type: fileTypeFromMime(mimeType),
      size: fileSize,
      modifiedAt,
      location: resolvedUri,
      fingerprint: buildFingerprint(resolvedUri, fileSize, modifiedAt),
    } satisfies ScannableFile);
  }
  
  return files;
}

export interface ScanProgress {
  phase: "scanning_images" | "scanning_audio" | "scanning_docs";
  current: number;
  total?: number;
  lastFile?: string;
}

async function scanMediaAssets(
  kind: "image" | "audio",
  first: number,
  onProgress?: (p: ScanProgress) => void
): Promise<ScannableFile[]> {
  const mediaType = kind === "image" ? [MediaLibrary.MediaType.photo] : [MediaLibrary.MediaType.audio];
  
  if (onProgress) {
    onProgress({ phase: kind === "image" ? "scanning_images" : "scanning_audio", current: 0 });
  }

  const files: ScannableFile[] = [];
  let totalFetched = 0;
  let hasNextPage = true;
  let endCursor: string | undefined;

  // Paginate through ALL assets (handle 2000+ images/audio files)
  while (hasNextPage && totalFetched < first) {
    const pageSize = Math.min(100, first - totalFetched);
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first: pageSize,
      after: endCursor,
      sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
    });

    if (!page.assets || page.assets.length === 0) {
      hasNextPage = false;
      break;
    }

    endCursor = page.endCursor;
    hasNextPage = page.hasNextPage ?? false;

    const scanned = await Promise.all(
      page.assets.map(async (asset, index) => {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
        const resolvedUri =
          assetInfo.localUri || (assetInfo as unknown as { uri?: string }).uri || asset.uri;

        if (onProgress && (totalFetched + index) % 5 === 0) {
          onProgress({
            phase: kind === "image" ? "scanning_images" : "scanning_audio",
            current: totalFetched + index + 1,
            total: first,
            lastFile: asset.filename,
          });
        }

        if (!isUploadableUri(resolvedUri)) {
          return null;
        }

        const mimeType = asset.mediaType === "audio" ? "audio/mpeg" : "image/jpeg";
        const modifiedAt = Number(asset.modificationTime ?? Date.now());
        
        let size = 0;
        try {
          const fileInfo = await getInfoAsync(resolvedUri);
          if (fileInfo && fileInfo.exists && typeof fileInfo.size === 'number') {
            size = fileInfo.size;
          }
        } catch (e) {
}
        return {
          id: asset.id,
          uri: resolvedUri,
          name: asset.filename || `${asset.id}.bin`,
          mimeType,
          type: kind,
          size,
          modifiedAt,
          location: resolvedUri,
          fingerprint: buildFingerprint(resolvedUri, size, modifiedAt),
        } satisfies ScannableFile;
      })
    );

    for (const file of scanned) {
      if (file) {
        files.push(file);
      }
    }

    totalFetched += page.assets.length;
  }

  return files;
}

async function walkDirectory(path: string, maxFiles: number, output: string[] = []): Promise<string[]> {
  if (output.length >= maxFiles) {
    return output;
  }

  const entries = await readDirectoryAsync(path);

  for (const entry of entries) {
    if (output.length >= maxFiles) {
      break;
    }

    const full = path.endsWith("/") ? `${path}${entry}` : `${path}/${entry}`;
    try {
      const info = await getInfoAsync(full);
      if (!info.exists) {
        continue;
      }
      if (info.isDirectory) {
        await walkDirectory(`${full}/`, maxFiles, output);
      } else {
        output.push(full);
      }
    } catch {
      // Ignore inaccessible files and continue scanning.
    }
  }

  return output;
}

async function walkSafDirectory(uri: string, maxFiles: number, output: string[] = []): Promise<string[]> {
  if (output.length >= maxFiles) {
    return output;
  }

  const saf = (FileSystem as any).StorageAccessFramework;
  if (!saf?.readDirectoryAsync) {
    return output;
  }

  const entries: string[] = await saf.readDirectoryAsync(uri);
  for (const entryUri of entries) {
    if (output.length >= maxFiles) {
      break;
    }

    try {
      const info = await getInfoAsync(entryUri);
      if (!info.exists) {
        continue;
      }
      if (info.isDirectory) {
        await walkSafDirectory(entryUri, maxFiles, output);
      } else {
        output.push(entryUri);
      }
    } catch {
      // Ignore inaccessible children and continue.
    }
  }

  return output;
}

export async function scanAppDocumentDirectory(
  maxFiles = 300,
  onProgress?: (p: ScanProgress) => void
): Promise<ScannableFile[]> {
  // @ts-ignore - documentDirectory exists on FileSystem API
  const docDir = (FileSystem as any).documentDirectory || FileSystem.documentDirectory;
  if (!docDir) {
    return [];
  }

  if (onProgress) {
    onProgress({ phase: "scanning_docs", current: 0 });
  }

  const roots = [docDir];
  if (Platform.OS === "android") {
    // Add all major public storage paths on Android
    roots.push(
      "file:///storage/emulated/0/DCIM/",        // Camera & screenshots
      "file:///storage/emulated/0/Pictures/",    // Pictures gallery
      "file:///storage/emulated/0/Download/",    // Downloaded files
      "file:///storage/emulated/0/Documents/",   // Documents
      "file:///storage/emulated/0/Music/",       // Music & audio
      "file:///storage/emulated/0/Podcasts/",    // Podcasts
      "file:///storage/emulated/0/Recordings/",  // Voice recordings
      "file:///storage/emulated/0/Movies/",      // Videos
      "file:///sdcard/DCIM/",                     // Alternative SD card path
      "file:///sdcard/Pictures/",
      "file:///sdcard/Download/"
    );
  }

  const allPaths: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    if (allPaths.length >= maxFiles) {
      break;
    }

    try {
      const info = await getInfoAsync(root);
      if (!info.exists || !info.isDirectory) {
        continue;
      }

      const remaining = maxFiles - allPaths.length;
      const walked = await walkDirectory(root, remaining, []);
      for (const p of walked) {
        if (!seen.has(p)) {
          seen.add(p);
          allPaths.push(p);
        }
      }
} catch (err) {
      // Ignore inaccessible roots and continue scanning available locations.
}
  }

  // Include SAF directory if available
  if (Platform.OS === "android" && allPaths.length < maxFiles) {
    const safRoot = await getStoredAndroidDirectoryUri();
    if (safRoot) {
      try {
const remaining = maxFiles - allPaths.length;
        const safFiles = await walkSafDirectory(safRoot, remaining, []);
        for (const p of safFiles) {
          if (!seen.has(p)) {
            seen.add(p);
            allPaths.push(p);
          }
        }
} catch (err) {
        // Ignore SAF traversal errors and keep other scan results.
}
    } else {
}
  }

  const files: ScannableFile[] = [];
  const supportedExtensions = /\.(pdf|doc|docx|txt|xls|xlsx|ppt|pptx|json|csv|md|jpg|jpeg|png|webp|gif|bmp|mp3|m4a|wav|ogg|flac|aac|mov|mp4|avi|mkv|wmv|m4v)$/i;

  for (let i = 0; i < allPaths.length; i++) {
    const path = allPaths[i];
    const name = path.split("/").pop() || "unknown";
    
    if (onProgress && i % 10 === 0) {
      onProgress({
        phase: "scanning_docs",
        current: i + 1,
        total: allPaths.length,
        lastFile: name,
      });
    }

    // Filter by supported file extensions only
    if (!supportedExtensions.test(name)) {
      continue;
    }

    try {
      const info = await getInfoAsync(path);
      if (!info.exists || info.isDirectory) {
        continue;
      }

      const mimeType = extToMime(name);
      const modifiedAt = Number((info as unknown as { modificationTime?: number }).modificationTime ?? Date.now());
      const size = Number((info as unknown as { size?: number }).size ?? 0);
      
      // Skip empty files and files larger than 500MB
      if (size === 0 || size > 500 * 1024 * 1024) {
        continue;
      }

      files.push({
        id: `${path}-${size}`,
        uri: path,
        name,
        mimeType,
        type: fileTypeFromMime(mimeType),
        size,
        modifiedAt,
        location: path,
        fingerprint: buildFingerprint(path, size, modifiedAt),
      });
    } catch (err) {
continue;
    }
  }
return files;
}

export async function scanDeviceFiles(options?: {
  includeImages?: boolean;
  includeAudio?: boolean;
  includeDocuments?: boolean;
  mediaLimit?: number;
  onProgress?: (p: ScanProgress) => void;
}): Promise<ScannableFile[]> {
  const includeImages = options?.includeImages ?? true;
  const includeAudio = options?.includeAudio ?? true;
  const includeDocuments = options?.includeDocuments ?? true;
  const mediaLimit = options?.mediaLimit ?? 2500;  // Scan up to 2500 photos/audio to handle large libraries
  const onProgress = options?.onProgress;

  const files: ScannableFile[] = [];

  let mediaAllowed = true;
  try {
    const perms = await requestScanPermissions();
    mediaAllowed = perms.mediaGranted;
  } catch {
    mediaAllowed = false;
  }

  if (includeImages && mediaAllowed) {
    files.push(...(await scanMediaAssets("image", mediaLimit, onProgress)));
  }
  if (includeAudio && mediaAllowed) {
    files.push(...(await scanMediaAssets("audio", mediaLimit, onProgress)));
  }
  if (includeDocuments) {
    files.push(...(await scanAppDocumentDirectory(mediaLimit, onProgress)));
  }

  return files;
}
