import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";

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

function isUploadableUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("content://");
}

function getPickerAssetUri(asset: DocumentPicker.DocumentPickerAsset): string {
  const fileCopyUri = (asset as unknown as { fileCopyUri?: string }).fileCopyUri;
  return fileCopyUri || asset.uri;
}

export async function requestScanPermissions(): Promise<{
  mediaGranted: boolean;
}> {
  const media = await MediaLibrary.requestPermissionsAsync();
  return { mediaGranted: media.granted };
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

  return picked.assets
    .map((asset) => {
    const resolvedUri = getPickerAssetUri(asset);
    if (!isUploadableUri(resolvedUri)) {
      return null;
    }

    const mimeType = asset.mimeType || extToMime(asset.name);
    const modifiedAt = Date.now();
    return {
      id: `${resolvedUri}-${asset.size ?? 0}`,
      uri: resolvedUri,
      name: asset.name,
      mimeType,
      type: fileTypeFromMime(mimeType),
      size: Number(asset.size ?? 0),
      modifiedAt,
      location: resolvedUri,
      fingerprint: buildFingerprint(resolvedUri, Number(asset.size ?? 0), modifiedAt),
    } satisfies ScannableFile;
  })
    .filter((file): file is ScannableFile => Boolean(file));
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

  const page = await MediaLibrary.getAssetsAsync({
    mediaType,
    first,
    sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
  });

  const scanned = await Promise.all(
    page.assets.map(async (asset, index) => {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
      const resolvedUri =
        assetInfo.localUri || (assetInfo as unknown as { uri?: string }).uri || asset.uri;

      if (onProgress && index % 5 === 0) {
        onProgress({
          phase: kind === "image" ? "scanning_images" : "scanning_audio",
          current: index + 1,
          total: page.assets.length,
          lastFile: asset.filename,
        });
      }

      if (!isUploadableUri(resolvedUri)) {
        return null;
      }

      const mimeType = asset.mediaType === "audio" ? "audio/mpeg" : "image/jpeg";
      const modifiedAt = Number(asset.modificationTime ?? Date.now());
      const size = Number((asset as unknown as { fileSize?: number }).fileSize ?? 0);
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

  const files: ScannableFile[] = [];
  for (const file of scanned) {
    if (file) {
      files.push(file);
    }
  }
  return files;
}

async function walkDirectory(path: string): Promise<string[]> {
  const entries = await FileSystem.readDirectoryAsync(path);
  const output: string[] = [];

  for (const entry of entries) {
    const full = `${path}${entry}`;
    const info = await FileSystem.getInfoAsync(full);
    if (!info.exists) {
      continue;
    }
    if (info.isDirectory) {
      const nested = await walkDirectory(`${full}/`);
      output.push(...nested);
    } else {
      output.push(full);
    }
  }

  return output;
}

export async function scanAppDocumentDirectory(
  maxFiles = 200,
  onProgress?: (p: ScanProgress) => void
): Promise<ScannableFile[]> {
  if (!FileSystem.documentDirectory) {
    return [];
  }

  if (onProgress) {
    onProgress({ phase: "scanning_docs", current: 0 });
  }

  const allPaths = await walkDirectory(FileSystem.documentDirectory);
  const files: ScannableFile[] = [];

  for (let i = 0; i < allPaths.slice(0, maxFiles).length; i++) {
    const path = allPaths[i];
    const name = path.split("/").pop() || "unknown";
    
    if (onProgress && i % 5 === 0) {
      onProgress({
        phase: "scanning_docs",
        current: i + 1,
        total: Math.min(allPaths.length, maxFiles),
        lastFile: name,
      });
    }

    const mimeType = extToMime(name);
    const type = fileTypeFromMime(mimeType);
    if (type !== "document") {
      continue;
    }

    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) {
      continue;
    }

    const modifiedAt = Number((info as unknown as { modificationTime?: number }).modificationTime ?? Date.now());
    const size = Number((info as unknown as { size?: number }).size ?? 0);
    files.push({
      id: `${path}-${size}`,
      uri: path,
      name,
      mimeType,
      type,
      size,
      modifiedAt,
      location: path,
      fingerprint: buildFingerprint(path, size, modifiedAt),
    });
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
  const mediaLimit = options?.mediaLimit ?? 100;
  const onProgress = options?.onProgress;

  const files: ScannableFile[] = [];

  if (includeImages) {
    files.push(...(await scanMediaAssets("image", mediaLimit, onProgress)));
  }
  if (includeAudio) {
    files.push(...(await scanMediaAssets("audio", mediaLimit, onProgress)));
  }
  if (includeDocuments) {
    files.push(...(await scanAppDocumentDirectory(mediaLimit, onProgress)));
  }

  return files;
}
