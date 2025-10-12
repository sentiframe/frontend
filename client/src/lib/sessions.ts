import { ngrokFetch } from "@/lib/queryClient";
import type { Session, EmotionDataPoint, CriticalMomentType } from "@shared/schema";

type SessionMeta = {
  displayName?: string;
  isFavorite?: boolean;
  deleted?: boolean;
  createdAt?: number;
};

const META_KEY = "sessionsMeta";

interface BackendSessionSummary {
  session_id: string;
  name?: string;
  status?: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
  duration?: number;
}

interface BackendSessionDetail extends BackendSessionSummary {
  emotion_data?: unknown[];
  critical_moments?: Array<{
    time: number;
    emotion: string;
    intensity?: number;
    description?: string;
  }>;
  ai_report?: {
    summary?: string;
    suggestions?: string[];
  };
}

function readMeta(): Record<string, SessionMeta> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}") as Record<string, SessionMeta>;
  } catch {
    return {};
  }
}

function writeMeta(meta: Record<string, SessionMeta>) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function updateSessionMeta(sessionId: string, patch: Partial<SessionMeta>) {
  const meta = readMeta();
  meta[sessionId] = { ...(meta[sessionId] || {}), ...patch };
  writeMeta(meta);
}

function ensureArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  return [];
}

function toEmotionDataPoint(raw: any, index: number): EmotionDataPoint {
  const baseTime = typeof raw?.time === "number" ? raw.time : index;
  const mapValue = (key: string) => {
    if (raw && typeof raw === "object") {
      if (typeof raw[key] === "number") return raw[key];
      if (raw.emotions && typeof raw.emotions[key] === "number") return raw.emotions[key];
    }
    return 0;
  };
  const point: EmotionDataPoint = {
    time: baseTime,
    Happy: mapValue("Happy") || mapValue("happy"),
    Sad: mapValue("Sad") || mapValue("sad"),
    Angry: mapValue("Angry") || mapValue("angry"),
    Fear: mapValue("Fear") || mapValue("fear"),
    Surprise: mapValue("Surprise") || mapValue("surprise"),
    Disgust: mapValue("Disgust") || mapValue("disgust"),
    Neutral: mapValue("Neutral") || mapValue("neutral"),
  };
  const entries = Object.entries(point).filter(([key]) => key !== "time") as Array<[keyof EmotionDataPoint, number]>;
  const dominant = entries.reduce((prev, curr) => (curr[1] > prev[1] ? curr : prev));
  point.dominant = dominant[0];
  point.dominantValue = dominant[1];
  return point;
}

function normalizeCriticalMoments(raw: BackendSessionDetail["critical_moments"]): CriticalMomentType[] {
  return ensureArray(raw).map((moment) => ({
    time: typeof moment.time === "number" ? moment.time : 0,
    emotion: moment.emotion || "Unknown",
    intensity: typeof moment.intensity === "number" ? moment.intensity : 0,
    description: moment.description || `${moment.emotion || "Emotion"} fluctuation`,
  }));
}

function computeDisplayTimestamp(createdAt?: string | number): { date: string; time: string } {
  const numeric = typeof createdAt === "number" ? createdAt : undefined;
  const candidate =
    typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt))
      ? new Date(createdAt)
      : typeof numeric === "number" && Number.isFinite(numeric)
      ? new Date(numeric)
      : new Date();
  return {
    date: candidate.toLocaleDateString(),
    time: candidate.toLocaleTimeString(),
  };
}

function baseSessionFromSummary(summary: BackendSessionSummary, meta: SessionMeta | undefined): Session {
  const timestamp = summary.created_at ? Date.parse(summary.created_at) : meta?.createdAt;
  const { date, time } = computeDisplayTimestamp(Number.isFinite(timestamp) ? timestamp : meta?.createdAt);
  return {
    id: summary.session_id,
    name: meta?.displayName || summary.name || summary.metadata?.name?.toString() || summary.session_id,
    date,
    time,
    duration: typeof summary.duration === "number" ? summary.duration : 0,
    isFavorite: !!meta?.isFavorite,
    videoId: summary.session_id,
    emotionData: [],
  };
}

function sessionFromDetail(detail: BackendSessionDetail, meta: SessionMeta | undefined): Session {
  const base = baseSessionFromSummary(detail, meta);
  const emotionData = ensureArray(detail.emotion_data).map(toEmotionDataPoint);
  const duration = detail.duration ?? (emotionData.length ? emotionData[emotionData.length - 1].time : base.duration);
  return {
    ...base,
    duration,
    emotionData,
    criticalMoments: normalizeCriticalMoments(detail.critical_moments),
    aiReport: detail.ai_report?.summary
      ? {
          summary: detail.ai_report.summary,
          suggestions: ensureArray<string>(detail.ai_report.suggestions),
        }
      : undefined,
  };
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await ngrokFetch(path, init);
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function createSession(name: string, metadata: Record<string, unknown> = {}): Promise<Session> {
  const body = JSON.stringify({ name, metadata });
  const summary = await fetchJson<BackendSessionSummary>("/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const meta = readMeta();
  meta[summary.session_id] = {
    ...(meta[summary.session_id] || {}),
    displayName: name,
    createdAt: summary.created_at ? Date.parse(summary.created_at) : Date.now(),
  };
  writeMeta(meta);
  return baseSessionFromSummary(summary, meta[summary.session_id]);
}

export async function startSession(sessionId: string): Promise<void> {
  await fetchJson("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function stopSession(sessionId: string): Promise<void> {
  await fetchJson("/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function listSessionsFromApi(): Promise<Session[]> {
  const summaries = await fetchJson<BackendSessionSummary[]>("/sessions");
  const meta = readMeta();
  const sessions = ensureArray<BackendSessionSummary>(summaries)
    .filter((summary) => !(meta[summary.session_id]?.deleted))
    .map((summary) => baseSessionFromSummary(summary, meta[summary.session_id]));

  sessions.sort((a, b) => new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime());
  return sessions;
}

export async function getSessionByIdFromApi(sessionId: string): Promise<Session | null> {
  try {
    const detail = await fetchJson<BackendSessionDetail>(`/session/${sessionId}`);
    const meta = readMeta()[sessionId];
    return sessionFromDetail(detail, meta);
  } catch (error) {
    console.error("Failed to fetch session detail", error);
    return null;
  }
}

export async function deleteSessionLocally(sessionId: string): Promise<void> {
  const meta = readMeta();
  meta[sessionId] = { ...(meta[sessionId] || {}), deleted: true };
  writeMeta(meta);
}
