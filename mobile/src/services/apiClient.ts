import { auth } from "./firebase";
import { Platform } from "react-native";

// API timeout constants (ms)
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const UPLOAD_TIMEOUT = 300000; // 5 minutes for file uploads
const QUERY_TIMEOUT = 60000; // 1 minute for queries

export interface ProcessingJob {
  jobId: string;
  status: "queued" | "processing" | "done" | "error";
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "done" | "error";
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

interface AiJobStatusResponse {
  job_id: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  current_step: string;
  file_name: string;
  file_type: string;
  chunks_processed: number;
  error?: string | null;
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

// Support for local development on different platforms
const getLocalBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;
  if (Platform.OS === "android") return "http://10.0.2.2:8000"; // Android emulator host
  return "http://127.0.0.1:8000"; // iOS simulator / default
};

let API_BASE_URL = getLocalBaseUrl();

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
  const url = `${API_BASE_URL}${path}`;

  try {
    const res = await fetchWithTimeout(url, { ...init, headers }, timeoutMs);
    return res;
  } catch (error) {
    const networkErr = classifyNetworkError(error);

    if (API_BASE_URL.includes("127.0.0.1") || API_BASE_URL.includes("localhost")) {
      throw new NetworkError(
        networkErr.code,
        networkErr.retriable,
        `Cannot reach local AI engine at ${API_BASE_URL}\n\n` +
          `FIX:\n` +
          `1. Open a terminal and run:\n` +
          `   cd ~/Desktop/Axyora/ai-engine\n` +
          `   source .venv/bin/activate\n` +
          `   uvicorn main:app --host 127.0.0.1 --port 8000\n\n` +
          `2. Wait for "Application startup complete" message\n\n` +
          `3. Refresh this app\n\n` +
          `If on physical device, set EXPO_PUBLIC_API_BASE_URL in .env to your laptop IP.\n` +
          `(${networkErr.message})`
      );
    }

    throw networkErr;
  }
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
        throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
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

  return {
    jobId: data.job_id,
    status: data.status,
  };
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const data = await makeRequest<AiJobStatusResponse>(
    () => authedFetch(`/status/${encodeURIComponent(jobId)}`, undefined, DEFAULT_TIMEOUT),
    2
  );

  return {
    jobId: data.job_id,
    status: data.status,
    progress: data.progress,
    currentStep: data.current_step,
    fileName: data.file_name,
    fileType: data.file_type,
    chunksProcessed: data.chunks_processed,
    error: data.error,
  };
}

export async function queryMemory(payload: {
  query: string;
  model?: string;
  topK?: number;
}): Promise<QueryResponse> {
  const userId = requireUserId();
  const modelToUse = payload.model || "llama3:8b";

  return makeRequest<QueryResponse>(
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
          }),
        },
        QUERY_TIMEOUT
      ),
    2
  );
}

export async function getIndexStats() {
  const userId = requireUserId();
  return makeRequest<any>(
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
