import { auth } from "./firebase";
import { Platform } from "react-native";
import Constants from "expo-constants";

// API timeout constants (ms)
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const UPLOAD_TIMEOUT = 300000; // 5 minutes for file uploads
const QUERY_TIMEOUT = 60000; // 1 minute for queries

export interface ProcessingJob {
  jobId: string;
  status: "queued" | "processing" | "done" | "error" | "skipped";
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "done" | "error" | "skipped";
  progress: number;
  currentStep: string;
  fileName: string;
  fileType: string;
  chunksProcessed: number;
  error?: string | null;
}

export interface SourceResult {
  file_name?: string;
  file_path?: string;
  name: string;
  path: string;
  type: string;
  score: number;
  preview: string;
  chunk_index: number;
}

export interface ImageResult {
  file_name: string;
  file_path: string;
  caption: string;
  preview: string;
  image_uri?: string;
  thumbnail_path?: string;
  score: number;
  type: "image";
}

export interface QueryResponse {
  answer: string;
  sources: SourceResult[];
  images?: ImageResult[];
  duration_ms: number;
  fallback: boolean;
}

export interface EngineMetrics {
  queue_size: number;
  queue_maxsize: number;
  worker_count: number;
  embedding_concurrency: number;
  processing_jobs: number;
  status_counts?: Record<string, number>;
  timestamp?: number;
}

export interface CurrentProcessingInfo {
  current_file: {
    job_id: string;
    file_name: string;
    file_type: string;
    status: string;
    current_step: string;
    progress: number;
    created_at?: number;
  } | null;
  queue_size: number;
  total_processed: number;
  total_in_queue: number;
  total_failed: number;
}

export interface IndexStatsResponse {
  total_files: number;
  indexed: number;
  pending: number;
  processing: number;
  failed: number;
  progress: number;
}

export interface DeltaScanRequestFile {
  file_path: string;
  file_name: string;
  file_hash: string;
  file_type: "image" | "document";
  last_modified: number;
}

export interface DeltaScanResponse {
  total_files: number;
  indexed: number;
  pending: number;
  processing: number;
  failed: number;
  new_count: number;
  updated_count: number;
  skipped_count: number;
  queue: Array<{
    file_path: string;
    file_name: string;
    file_hash: string;
    file_type: "image" | "document";
    last_modified: number;
    change_type: "new" | "updated";
  }>;
}

interface AiJobStatusResponse {
  job_id: string;
  status: "queued" | "processing" | "done" | "error" | "skipped";
  progress?: number;
  current_step?: string;
  file_name: string;
  file_type: string;
  chunks_processed?: number;
  error?: string | null;
  message?: string;
}

// Network error classification
class NetworkError extends Error {
  constructor(
    public code: string,
    public retriable: boolean,
    message: string
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function extractExpoHost(): string | null {
  const candidates = [
    (Constants as any)?.expoConfig?.hostUri,
    (Constants as any)?.expoGoConfig?.debuggerHost,
    (Constants as any)?.manifest?.debuggerHost,
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost,
  ];

  for (const raw of candidates) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    const host = raw.split(":")[0]?.trim();
    if (host) return host;
  }

  return null;
}

function getCandidateBaseUrls(): string[] {
  const urls = new Set<string>();

  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    urls.add(normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL));
  }

  const expoHost = extractExpoHost();
  if (expoHost) {
    urls.add(`http://${expoHost}:8000`);
  }

  if (Platform.OS === "android") {
    urls.add("http://10.0.2.2:8000");
  }

  urls.add("http://127.0.0.1:8000");
  urls.add("http://localhost:8000");

  return Array.from(urls);
}

let API_BASE_URL = getCandidateBaseUrls()[0] || "http://127.0.0.1:8000";

function requireUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("You must be signed in to use file processing and AI chat.");
  }
  return uid;
}

async function authHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Classify network errors for retry logic
 */
function classifyNetworkError(error: unknown): NetworkError {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    
    // Connection errors (retriable)
    if (message.includes("network") || message.includes("failed to fetch")) {
      return new NetworkError("NETWORK_ERROR", true, "Network connection failed");
    }
    
    // Timeout errors (retriable)
    if (message.includes("abort")) {
      return new NetworkError("TIMEOUT", true, "Request timeout - server may be slow");
    }
  }

  return new NetworkError("UNKNOWN_ERROR", false, String(error));
}

async function authedFetch(
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const headers = await authHeaders(init?.headers);
  const candidates = getCandidateBaseUrls();
  const prioritized = [API_BASE_URL, ...candidates.filter((url) => url !== API_BASE_URL)];
let lastNetworkErr: NetworkError | null = null;

  for (const baseUrl of prioritized) {
    const url = `${baseUrl}${path}`;
    try {
const res = await fetchWithTimeout(url, { ...init, headers }, timeoutMs);
API_BASE_URL = baseUrl;
      return res;
    } catch (error) {
const networkErr = classifyNetworkError(error);
      lastNetworkErr = networkErr;

      if (!networkErr.retriable) {
        throw networkErr;
      }
    }
  }

  const tried = prioritized.join(", ");
throw new NetworkError(
    lastNetworkErr?.code || "NETWORK_ERROR",
    true,
    `Cannot reach AI engine. Tried: ${tried}\n\n` +
      `FIX:\n` +
      `1. Start backend:\n` +
      `   cd ~/Desktop/Axyora/ai-engine\n` +
      `   source .venv/bin/activate\n` +
      `   uvicorn main:app --host 0.0.0.0 --port 8000\n\n` +
      `2. Ensure phone and laptop are on same Wi-Fi\n` +
      `3. Optional: set EXPO_PUBLIC_API_BASE_URL in mobile/.env (e.g. http://192.168.x.x:8000)\n\n` +
      `(${lastNetworkErr?.message || "Connection failed"})`
  );
}

export function getResolvedApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function checkEngineHealth(): Promise<boolean> {
  const res = await authedFetch("/health", undefined, 8000);
  return res.ok;
}

export async function getEngineMetrics(): Promise<EngineMetrics | null> {
  const res = await authedFetch("/metrics", undefined, 8000);

  // Some engine builds do not expose /metrics; treat 404/501 as "metrics unavailable" instead of an error
  if (res.status === 404 || res.status === 501) {
    return null;
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json();
}

export async function getCurrentProcessing(userId: string): Promise<CurrentProcessingInfo> {
  const res = await authedFetch(`/current-processing?user_id=${encodeURIComponent(userId)}`, undefined, 8000);

  if (res.status === 404 || res.status === 501) {
    return {
      current_file: null,
      queue_size: 0,
      total_processed: 0,
      total_in_queue: 0,
      total_failed: 0,
    };
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json();
}

/**
 * Make API call with automatic retry for retriable errors
 */
async function makeRequest<T>(
  method: () => Promise<Response>,
  maxRetries: number = 2,
  backoffMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await method();

      if (!res.ok) {
        const errorText = await res.text();
        throw new HttpError(res.status, `HTTP ${res.status}: ${errorText || res.statusText}`);
      }

      return res.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if retriable
      if (error instanceof NetworkError && !error.retriable) {
        throw error; // Don't retry non-retriable errors
      }

      // Last attempt - throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff before retry
      const delay = backoffMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Unknown error");
}

export async function getSettings() {
  return makeRequest<any>(() => authedFetch("/v1/settings", undefined, DEFAULT_TIMEOUT));
}

export async function updateSettings(payload: Record<string, unknown>) {
  return makeRequest<any>(() =>
    authedFetch("/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, DEFAULT_TIMEOUT)
  );
}

export async function submitFileForProcessing(params: {
  fileUri: string;
  fileName: string;
  mimeType: string;
  filePath: string;
  modifiedAt?: number;
  jobId?: string;
}): Promise<ProcessingJob> {
  const userId = requireUserId();
  const resolvedJobId = params.jobId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Create FormData with properly formatted file
    const form = new FormData();
    const fileBlob = {
      uri: params.fileUri,
      name: params.fileName,
      type: params.mimeType,
    } as any;

    form.append("file", fileBlob);
    form.append("user_id", userId);
    form.append("job_id", resolvedJobId);
    form.append("file_path", params.filePath);

    if (typeof params.modifiedAt === "number") {
      form.append("modified_at", String(params.modifiedAt));
    }
const data = await makeRequest<AiJobStatusResponse>(
      () => authedFetch("/process-file", { method: "POST", body: form }, UPLOAD_TIMEOUT),
      1 // Only 1 retry for uploads
    );

    // Log skipped files so user knows
    if (data.status === "skipped") {
      console.log(`[API] File skipped (already indexed): ${params.fileName}`);
    }

    return {
      jobId: data.job_id,
      status: data.status,
    };
  } catch (error) {
throw error;
  }
}

export async function checkIndexedFiles(fileHashes: string[]): Promise<{
  indexed: string[];
  new_count: number;
  indexed_count: number;
}> {
  const userId = requireUserId();
  
  try {
    const response = await makeRequest<{
      indexed: string[];
      new_count: number;
      indexed_count: number;
    }>(
      () => authedFetch("/check-indexed-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          file_hashes: fileHashes,
        }),
      }, DEFAULT_TIMEOUT),
      2
    );

    return response;
  } catch (error) {
    console.warn("[apiClient] Failed to check indexed files:", error);
    throw error;
  }
}

export async function checkScanDelta(files: DeltaScanRequestFile[]): Promise<DeltaScanResponse> {
  const userId = requireUserId();

  try {
    return await makeRequest<DeltaScanResponse>(
      () =>
        authedFetch(
          "/scan-delta",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              files,
            }),
          },
          DEFAULT_TIMEOUT
        ),
      2
    );
  } catch (error) {
    // Backward compatibility: some local engine builds expose /scan but not /scan-delta.
    if (error instanceof HttpError && (error.status === 404 || error.status === 501)) {
      try {
        const legacy = await makeRequest<{ user_id: string; queued: number; queue: any[] }>(
          () =>
            authedFetch(
              "/scan",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: userId,
                  files: files.map((f) => ({
                    file_path: f.file_path,
                    file_name: f.file_name,
                    file_hash: f.file_hash,
                    file_type: f.file_type,
                    last_modified: f.last_modified,
                  })),
                }),
              },
              DEFAULT_TIMEOUT
            ),
          1
        );

        const queued = Array.isArray(legacy.queue) ? legacy.queue : [];
        return {
          total_files: files.length,
          indexed: Math.max(0, files.length - queued.length),
          pending: queued.length,
          processing: 0,
          failed: 0,
          new_count: queued.length,
          updated_count: 0,
          skipped_count: Math.max(0, files.length - queued.length),
          queue: queued.map((q: any) => ({
            file_path: String(q.file_path || ""),
            file_name: String(q.file_name || ""),
            file_hash: String(q.file_hash || ""),
            file_type: (q.file_type === "image" ? "image" : "document") as "image" | "document",
            last_modified: Number(q.last_modified || Date.now()),
            change_type: "new" as const,
          })),
        };
      } catch {
        // Fall through to local-first fallback below.
      }

      // Local-first fallback: allow queueing and let process-file dedup/skip server-side.
      return {
        total_files: files.length,
        indexed: 0,
        pending: files.length,
        processing: 0,
        failed: 0,
        new_count: files.length,
        updated_count: 0,
        skipped_count: 0,
        queue: files.map((f) => ({
          file_path: f.file_path,
          file_name: f.file_name,
          file_hash: f.file_hash,
          file_type: f.file_type,
          last_modified: f.last_modified,
          change_type: "new" as const,
        })),
      };
    }

    throw error;
  }
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const data = await makeRequest<AiJobStatusResponse>(
    () => authedFetch(`/status/${encodeURIComponent(jobId)}`, undefined, DEFAULT_TIMEOUT),
    2
  );

  return {
    jobId: data.job_id,
    status: data.status,
    progress: typeof data.progress === "number" ? data.progress : 0,
    currentStep: data.current_step ?? "Queued",
    fileName: data.file_name,
    fileType: data.file_type,
    chunksProcessed: typeof data.chunks_processed === "number" ? data.chunks_processed : 0,
    error: data.error,
  };
}

export interface FileTypeStats {
  image: number;
  audio: number;
  video: number;
  document: number;
  text: number;
  total: number;
}

export async function getFileTypeStats(userId: string): Promise<FileTypeStats> {
  return makeRequest<FileTypeStats>(
    () => authedFetch(`/stats/file-types/${encodeURIComponent(userId)}`, undefined, DEFAULT_TIMEOUT),
    2
  );
}

export async function queryMemory(payload: {
  query: string;
  model?: string;
  topK?: number;
  fileType?: "all" | "image" | "document";
}): Promise<QueryResponse> {
  const userId = requireUserId();
  const modelToUse = payload.model || "llama3:8b";

  const response = await makeRequest<QueryResponse>(
    () =>
      authedFetch(
        "/query",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: payload.query,
            user_id: userId,
            model: modelToUse,
            top_k: payload.topK ?? 5,
            file_type: payload.fileType ?? "all",
          }),
        },
        QUERY_TIMEOUT
      ),
    2
  );
  
  if (response.images && response.images.length > 0) {
response.images.forEach((img, idx) => {
    });
  }

  return response;
}

export async function getIndexStats(): Promise<IndexStatsResponse> {
  const userId = requireUserId();
  return makeRequest<IndexStatsResponse>(
    () => authedFetch(`/index-stats?user_id=${encodeURIComponent(userId)}`, undefined, DEFAULT_TIMEOUT),
    2
  );
}

export async function clearIndex() {
  const userId = requireUserId();
  return makeRequest<any>(
    () =>
      authedFetch(`/clear?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      }, DEFAULT_TIMEOUT),
    1
  );
}
