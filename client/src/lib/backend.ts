const BACKEND_BASE = (import.meta as any).env?.VITE_BACKEND_BASE_URL || "http://0.0.0.0:80";

function normalizeBase(base: string) {
  return base.replace(/\/$/, "");
}

const RESOLVED_BACKEND_BASE = normalizeBase(BACKEND_BASE);

function resolveBackendPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (import.meta.env?.DEV) {
    return `/backend${normalized}`;
  }
  return `${RESOLVED_BACKEND_BASE}${normalized}`;
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(resolveBackendPath(path), {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend ${response.status}: ${text || response.statusText}`);
  }

  return response;
}

export async function backendFetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await backendFetch(path, init);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
