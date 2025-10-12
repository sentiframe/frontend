import { apiFetch, ngrokFetch } from "@/lib/queryClient";
import {
  getAllVideos,
  getAllFrames,
  getVideoIdsFromFrames,
  getVideoById,
  type FrameRecord,
} from "@/lib/firebase";
import type { Session, EmotionDataPoint, CriticalMomentType } from "@shared/schema";

type EmotionType = "Happy" | "Sad" | "Angry" | "Fear" | "Surprise" | "Disgust" | "Neutral";

type SessionMeta = {
  displayName?: string;
  isFavorite?: boolean;
  deleted?: boolean;
  createdAt?: number;
};

export interface PersonEmotionBreakdown {
  id: string;
  label: string;
  dominantEmotion: EmotionType;
  dominantValue: number;
  emotions: Record<EmotionType, number>;
  framesObserved: number;
  notes: string[];
}

const META_KEY = "sessionsMeta";
const EMOTION_KEYS: EmotionType[] = [
  "Happy",
  "Sad",
  "Angry",
  "Fear",
  "Surprise",
  "Disgust",
  "Neutral",
];

type PeopleAccumulatorEntry = {
  label: string;
  sums: Record<EmotionType, number>;
  framesObserved: number;
};

type PeopleAccumulator = Map<string, PeopleAccumulatorEntry>;

type EmotionScoreRecord = Record<string, number | undefined>;

type SessionWithAudience = Session & { peopleBreakdown?: PersonEmotionBreakdown[] };

const SCORE_KEY_ALIASES: Record<EmotionType, string[]> = {
  Happy: ["Happy", "happy", "happiness"],
  Sad: ["Sad", "sad", "sadness"],
  Angry: ["Angry", "angry", "anger"],
  Fear: ["Fear", "fear", "fearfulness"],
  Surprise: ["Surprise", "surprise"],
  Disgust: ["Disgust", "disgust"],
  Neutral: ["Neutral", "neutral"],
};

function ensureNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeEmotionPointFromApi(raw: any): EmotionDataPoint | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const point: EmotionDataPoint = {
    time: ensureNumber(raw.time),
    Happy: ensureNumber(raw.Happy ?? raw.happy),
    Sad: ensureNumber(raw.Sad ?? raw.sad),
    Angry: ensureNumber(raw.Angry ?? raw.anger),
    Fear: ensureNumber(raw.Fear ?? raw.fear),
    Surprise: ensureNumber(raw.Surprise ?? raw.surprise),
    Disgust: ensureNumber(raw.Disgust ?? raw.disgust),
    Neutral: ensureNumber(raw.Neutral ?? raw.neutral),
  };

  const dominant =
    typeof raw.dominant === "string"
      ? raw.dominant
      : typeof raw.dominantEmotion === "string"
        ? raw.dominantEmotion
        : undefined;
  if (dominant) {
    point.dominant = dominant;
  }

  const dominantValueRaw = raw.dominantValue ?? raw.dominant_value;
  const dominantValue = Number(dominantValueRaw);
  if (Number.isFinite(dominantValue)) {
    point.dominantValue = dominantValue;
  }

  return point;
}

function normalizeEmotionDataPoints(raw: unknown): EmotionDataPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeEmotionPointFromApi(item))
    .filter((point): point is EmotionDataPoint => !!point)
    .sort((a, b) => a.time - b.time);
}

function normalizeCriticalMoment(raw: any): CriticalMomentType | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const emotion = typeof raw.emotion === "string" ? raw.emotion : undefined;
  if (!emotion) {
    return null;
  }
  const time = ensureNumber(raw.time);
  const intensity = ensureNumber(raw.intensity ?? raw.value);
  const description =
    typeof raw.description === "string" && raw.description.trim().length
      ? raw.description
      : `${emotion} spike detected`;

  return {
    time,
    emotion,
    intensity,
    description,
  };
}

function normalizeCriticalMoments(raw: unknown): CriticalMomentType[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeCriticalMoment(item))
    .filter((moment): moment is CriticalMomentType => !!moment);
}

function normalizePeopleBreakdown(raw: unknown): PersonEmotionBreakdown[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const id = (item as any).id ?? `person-${index + 1}`;
      const label = typeof (item as any).label === "string" ? (item as any).label : String(id);

      const dominantEmotionCandidate = (item as any).dominantEmotion ?? (item as any).dominant_emotion;
      const dominantEmotion = EMOTION_KEYS.includes(dominantEmotionCandidate)
        ? (dominantEmotionCandidate as EmotionType)
        : "Neutral";

      const dominantValue = ensureNumber((item as any).dominantValue ?? (item as any).dominant_value);
      const framesObserved = ensureNumber((item as any).framesObserved ?? (item as any).frames_observed);

      const emotions: Record<EmotionType, number> = createEmptyEmotionSums();
      EMOTION_KEYS.forEach((emotion) => {
        const source = (item as any).emotions || {};
        const value = ensureNumber(source[emotion] ?? source[emotion.toLowerCase()]);
        emotions[emotion] = value;
      });

      const notes = Array.isArray((item as any).notes)
        ? (item as any).notes.filter((note: unknown): note is string => typeof note === "string")
        : [];

      return {
        id: String(id),
        label,
        dominantEmotion,
        dominantValue,
        emotions,
        framesObserved,
        notes,
      } satisfies PersonEmotionBreakdown;
    })
    .filter((entry): entry is PersonEmotionBreakdown => !!entry);
}

function normalizeSessionFromApi(raw: any, meta?: SessionMeta): SessionWithAudience | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = raw.id ?? raw.session_id ?? raw.sessionId;
  if (!id) {
    return null;
  }

  const createdAtRaw = raw.createdAt ?? raw.created_at ?? meta?.createdAt;
  const createdAt =
    typeof createdAtRaw === "number"
      ? createdAtRaw
      : typeof createdAtRaw === "string"
        ? Date.parse(createdAtRaw)
        : Date.now();

  const { date: fallbackDate, time: fallbackTime } = computeDisplayTimestamp(createdAt);
  const date = typeof raw.date === "string" && raw.date.length ? raw.date : fallbackDate;
  const time = typeof raw.time === "string" && raw.time.length ? raw.time : fallbackTime;
  const durationRaw =
    raw.duration ?? raw.durationSeconds ?? raw.duration_seconds ?? raw.frameCount ?? raw.frames;
  const duration = typeof durationRaw === "number" ? durationRaw : Number(durationRaw) || 0;

  const session: SessionWithAudience = {
    id: String(id),
    name: meta?.displayName || raw.name || `Session ${id}`,
    date,
    time,
    duration,
    isFavorite: typeof meta?.isFavorite === "boolean" ? meta.isFavorite : !!raw.isFavorite,
    videoId: raw.videoId ?? raw.video_id ?? String(id),
    emotionData: normalizeEmotionDataPoints(raw.emotionData),
  };

  const criticalMoments = normalizeCriticalMoments(raw.criticalMoments);
  if (criticalMoments.length) {
    session.criticalMoments = criticalMoments;
  }

  if (raw.aiReport && typeof raw.aiReport === "object" && raw.aiReport !== null) {
    const summary = (raw.aiReport as any).summary;
    if (typeof summary === "string" && summary.length) {
      session.aiReport = {
        summary,
        suggestions: Array.isArray((raw.aiReport as any).suggestions)
          ? (raw.aiReport as any).suggestions.filter((s: unknown): s is string => typeof s === "string")
          : [],
      };
    }
  }

  const breakdown = normalizePeopleBreakdown(raw.peopleBreakdown);
  if (breakdown.length) {
    session.peopleBreakdown = breakdown;
  }

  return session;
}

function buildSessionFromMeta(id: string, meta: SessionMeta): Session {
  const { date, time } = computeDisplayTimestamp(meta.createdAt || Date.now());
  return {
    id,
    name: meta.displayName || `Session ${id}`,
    date,
    time,
    duration: 0,
    isFavorite: !!meta.isFavorite,
    videoId: id,
    emotionData: [],
  };
}

async function fetchSessionsFromApi(metaMap: Record<string, SessionMeta>): Promise<Session[]> {
  const res = await apiFetch("/sessions", { cache: "no-store" });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Failed to load sessions (${res.status}): ${message}`);
  }

  const payload = await res.json();
  const rawSessions: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.sessions)
      ? (payload as any).sessions
      : [];

  const sessions: Session[] = rawSessions
    .map((raw) => normalizeSessionFromApi(raw, metaMap[String(raw?.id)]))
    .filter((session): session is SessionWithAudience => !!session)
    .filter((session) => {
      const meta = metaMap[session.id];
      return !meta?.deleted;
    })
    .map((session) => {
      const meta = metaMap[session.id];
      if (meta?.displayName) {
        session.name = meta.displayName;
      }
      if (typeof meta?.isFavorite === "boolean") {
        session.isFavorite = meta.isFavorite;
      }
      const { peopleBreakdown: _ignored, ...base } = session;
      return base as Session;
    });

  Object.entries(metaMap).forEach(([id, meta]) => {
    if (meta.deleted) return;
    if (sessions.some((session) => session.id === id)) return;
    sessions.push(buildSessionFromMeta(id, meta));
  });

  sessions.sort(
    (a, b) =>
      new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime(),
  );
  return sessions;
}

async function listSessionsFromFirestore(metaMap: Record<string, SessionMeta>): Promise<Session[]> {
  const videos = await getAllVideos();
  const sessions: Session[] = [];

  if (videos.length > 0) {
    for (const video of videos) {
      const meta = metaMap[video.id] || {};
      if (meta.deleted) continue;
      const createdAt = meta.createdAt || Date.now();
      const { date, time } = computeDisplayTimestamp(createdAt);
      sessions.push({
        id: video.id,
        name: meta.displayName || video.name || `Session ${video.id}`,
        date,
        time,
        duration: typeof video.frameCount === "number" ? video.frameCount : 0,
        isFavorite: !!meta.isFavorite,
        videoId: video.id,
        emotionData: [],
      });
    }
  } else {
    const ids = await getVideoIdsFromFrames();
    for (const id of ids) {
      const meta = metaMap[id] || {};
      if (meta.deleted) continue;
      const frames = await getAllFrames(id);
      const duration = frames.length ? frames[frames.length - 1].frameNumber : 0;
      const createdAt = meta.createdAt || Date.now();
      const { date, time } = computeDisplayTimestamp(createdAt);
      sessions.push({
        id,
        name: meta.displayName || `Session ${id}`,
        date,
        time,
        duration,
        isFavorite: !!meta.isFavorite,
        videoId: id,
        emotionData: [],
      });
    }
  }

  Object.entries(metaMap).forEach(([id, meta]) => {
    if (meta.deleted) return;
    if (sessions.some((session) => session.id === id)) return;
    sessions.push(buildSessionFromMeta(id, meta));
  });

  sessions.sort(
    (a, b) =>
      new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime(),
  );

  return sessions;
}

async function fetchSessionDetailFromApi(
  sessionId: string,
  metaMap: Record<string, SessionMeta>,
): Promise<SessionWithAudience | null> {
  const res = await apiFetch(`/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Failed to load session ${sessionId} (${res.status}): ${message}`);
  }

  const payload = await res.json();
  const normalized = normalizeSessionFromApi(payload, metaMap[sessionId]);
  if (!normalized) {
    return null;
  }

  const meta = metaMap[normalized.id];
  if (meta?.deleted) {
    return null;
  }

  if (meta?.displayName) {
    normalized.name = meta.displayName;
  }
  if (typeof meta?.isFavorite === "boolean") {
    normalized.isFavorite = meta.isFavorite;
  }
  if (!normalized.videoId) {
    normalized.videoId = normalized.id;
  }

  return normalized;
}

async function getSessionDetailFromFirestore(
  sessionId: string,
  metaMap: Record<string, SessionMeta>,
): Promise<(Session & { peopleBreakdown: PersonEmotionBreakdown[] }) | null> {
  const meta = metaMap[sessionId];
  if (meta?.deleted) {
    return null;
  }

  const video = await getVideoById(sessionId);
  if (!video && !meta) {
    return null;
  }

  const createdAt = meta?.createdAt || Date.now();
  const { date, time } = computeDisplayTimestamp(createdAt);

  const base: Session = {
    id: sessionId,
    name: meta?.displayName || video?.name || `Session ${sessionId}`,
    date,
    time,
    duration: video?.frameCount ?? 0,
    isFavorite: !!meta?.isFavorite,
    videoId: video?.id ?? sessionId,
    emotionData: [],
  };

  const frames = await getAllFrames(sessionId);
  const peopleAccumulator: PeopleAccumulator = new Map();

  const emotionData: EmotionDataPoint[] = frames.map((frame, index) =>
    toEmotionPoint(frame, index, peopleAccumulator),
  );

  const duration = emotionData.length ? emotionData[emotionData.length - 1].time : base.duration;

  const criticalMoments: CriticalMomentType[] = [];
  for (let i = 1; i < emotionData.length - 1; i++) {
    const curr = emotionData[i];
    const prev = emotionData[i - 1];
    const next = emotionData[i + 1];
    EMOTION_KEYS.forEach((emotion) => {
      const c = curr[emotion];
      const p = prev[emotion] || 0;
      const n = next[emotion] || 0;
      if (c > p && c > n && c > 0.6) {
        criticalMoments.push({
          time: curr.time,
          emotion,
          intensity: c,
          description: `${emotion} spike detected`,
        });
      }
    });
  }

  const topCriticalMoments = criticalMoments
    .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))
    .slice(0, 3);

  const peopleBreakdown: PersonEmotionBreakdown[] = Array.from(peopleAccumulator.entries()).map(
    ([id, info]) => {
      const averages = { ...info.sums } as Record<EmotionType, number>;
      EMOTION_KEYS.forEach((emotion) => {
        averages[emotion] = info.framesObserved ? averages[emotion] / info.framesObserved : 0;
      });

      const dominant = EMOTION_KEYS
        .map((emotion) => ({ emotion, value: averages[emotion] }))
        .reduce(
          (prev, curr) => (curr.value > prev.value ? curr : prev),
          { emotion: "Neutral", value: 0 },
        );

      const notes: string[] = [];
      if (dominant.value < 0.35) {
        notes.push("Low confidence across emotions. Potential recognition drift.");
      }
      if (averages.Neutral > 0.75) {
        notes.push("Neutral dominates. Consider lighting/camera bias or minimal expression.");
      }
      if (info.framesObserved < frames.length * 0.4) {
        notes.push("Face intermittently detected. Insights may be noisy.");
      }

      return {
        id,
        label: info.label,
        dominantEmotion: dominant.emotion,
        dominantValue: dominant.value,
        emotions: averages,
        framesObserved: info.framesObserved,
        notes,
      };
    },
  );

  peopleBreakdown.sort((a, b) => b.dominantValue - a.dominantValue);

  return {
    ...base,
    duration,
    emotionData,
    criticalMoments: topCriticalMoments,
    peopleBreakdown: peopleBreakdown.slice(0, 8),
  };
}

function createEmptyEmotionSums(): Record<EmotionType, number> {
  return {
    Happy: 0,
    Sad: 0,
    Angry: 0,
    Fear: 0,
    Surprise: 0,
    Disgust: 0,
    Neutral: 0,
  };
}

function resolveScore(scores: EmotionScoreRecord | undefined, emotion: EmotionType): number {
  if (!scores) {
    return 0;
  }
  const keys = SCORE_KEY_ALIASES[emotion] || [emotion];
  for (const key of keys) {
    const value = scores[key];
    if (typeof value === "number") {
      return value <= 1 ? value : value / 100;
    }
  }
  return 0;
}

function toEmotionPoint(frame: FrameRecord, index: number, peopleAccumulator?: PeopleAccumulator): EmotionDataPoint {
  const safeTime = frame.frameNumber ?? index;
  const fallbackPoint: EmotionDataPoint = {
    time: safeTime,
    Happy: 0,
    Sad: 0,
    Angry: 0,
    Fear: 0,
    Surprise: 0,
    Disgust: 0,
    Neutral: 0,
    dominant: "Neutral",
    dominantValue: 0,
  };

  const detections = frame.data?.detections ?? [];
  const primary = detections[0];

  if (!primary) {
    return fallbackPoint;
  }

  if (peopleAccumulator) {
    detections.forEach((det, detIdx) => {
      const faceId = (det as any).face_id ? String((det as any).face_id) : `Person ${detIdx + 1}`;
      const label = (det as any).label || faceId;
      const scoreRecord = det.emotion_scores as unknown as EmotionScoreRecord | undefined;
      const existing = peopleAccumulator.get(faceId) || {
        label,
        sums: createEmptyEmotionSums(),
        framesObserved: 0,
      };

      existing.framesObserved += 1;
      EMOTION_KEYS.forEach((emotion) => {
        const value = resolveScore(scoreRecord, emotion);
        existing.sums[emotion] += value;
      });

      peopleAccumulator.set(faceId, existing);
    });
  }

  const scoreRecord = primary.emotion_scores as unknown as EmotionScoreRecord | undefined;
  const point: EmotionDataPoint = {
    time: safeTime,
    Happy: resolveScore(scoreRecord, "Happy"),
    Sad: resolveScore(scoreRecord, "Sad"),
    Angry: resolveScore(scoreRecord, "Angry"),
    Fear: resolveScore(scoreRecord, "Fear"),
    Surprise: resolveScore(scoreRecord, "Surprise"),
    Disgust: resolveScore(scoreRecord, "Disgust"),
    Neutral: resolveScore(scoreRecord, "Neutral"),
    dominant: "Neutral",
    dominantValue: 0,
  };

  const dominant = EMOTION_KEYS
    .map((emotion) => ({ emotion, value: point[emotion] }))
    .reduce((prev, curr) => (curr.value > prev.value ? curr : prev), { emotion: "Neutral", value: 0 });

  point.dominant = dominant.emotion;
  point.dominantValue = dominant.value;
  return point;
}

export function frameToEmotionPoint(frame: FrameRecord, index: number): EmotionDataPoint {
  return toEmotionPoint(frame, index);
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

function computeDisplayTimestamp(timestamp?: number): { date: string; time: string } {
  const base = timestamp ? new Date(timestamp) : new Date();
  return {
    date: base.toLocaleDateString(),
    time: base.toLocaleTimeString(),
  };
}

export async function createSession(name: string, metadata: Record<string, unknown> = {}): Promise<Session> {
  const body = JSON.stringify({ name, metadata });
  const res = await ngrokFetch("/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const payload = await res.json();
  const sessionId = payload.session_id || payload.id || name;
  const createdAt = payload.created_at ? Date.parse(payload.created_at) : Date.now();
  updateSessionMeta(sessionId, { displayName: name, createdAt });
  const { date, time } = computeDisplayTimestamp(createdAt);
  return {
    id: sessionId,
    name,
    date,
    time,
    duration: 0,
    isFavorite: false,
    videoId: sessionId,
    emotionData: [],
  };
}

export async function startSession(sessionId: string): Promise<void> {
  await ngrokFetch("/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function stopSession(sessionId: string): Promise<void> {
  await ngrokFetch("/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function listSessionsFromFirebase(): Promise<Session[]> {
  const meta = readMeta();
  try {
    return await fetchSessionsFromApi(meta);
  } catch (error) {
    console.warn("[sessions] Falling back to direct Firebase listing:", error);
    return await listSessionsFromFirestore(meta);
  }
}

export async function getSessionByIdFromFirebase(sessionId: string): Promise<Session | null> {
  const metaMap = readMeta();
  try {
    const apiSession = await fetchSessionDetailFromApi(sessionId, metaMap);
    if (apiSession) {
      if (!apiSession.emotionData.length) {
        const fallback = await getSessionDetailFromFirestore(sessionId, metaMap);
        if (fallback) {
          if (apiSession.aiReport) {
            fallback.aiReport = apiSession.aiReport;
          }
          if (apiSession.criticalMoments?.length) {
            fallback.criticalMoments = apiSession.criticalMoments;
          }
          if (apiSession.peopleBreakdown?.length) {
            (fallback as SessionWithAudience).peopleBreakdown = apiSession.peopleBreakdown;
          }
          return fallback;
        }
      }
      return apiSession;
    }
  } catch (error) {
    console.warn(`[sessions] Falling back to Firestore for session ${sessionId}:`, error);
  }

  return await getSessionDetailFromFirestore(sessionId, metaMap);
}

export async function deleteSessionLocally(sessionId: string): Promise<void> {
  const meta = readMeta();
  meta[sessionId] = { ...(meta[sessionId] || {}), deleted: true };
  writeMeta(meta);
}
