import type { Session, EmotionDataPoint } from "@shared/schema";
import { getAllVideos, getAllFrames, getVideoIdsFromFrames } from "@/lib/firebase";

type SessionMeta = {
  name?: string;
  isFavorite?: boolean;
  deleted?: boolean;
  createdAt?: number;
};

const META_KEY = "sessionsMeta";

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

export function updateSessionMeta(videoId: string, patch: Partial<SessionMeta>) {
  const meta = readMeta();
  meta[videoId] = { ...(meta[videoId] || {}), ...patch };
  writeMeta(meta);
}

export async function listSessionsFromFirebase(): Promise<Session[]> {
  const videos = await getAllVideos();
  const meta = readMeta();

  const sessions: Session[] = [];

  if (videos.length > 0) {
    for (const v of videos) {
      const m = meta[v.id] || {};
      if (m.deleted) continue;

      const timestamp = m.createdAt || Date.now();
      const dateObj = new Date(timestamp);

      sessions.push({
        id: v.id,
        name: m.name || v.name || `Session ${v.id}`,
        date: dateObj.toLocaleDateString(),
        time: dateObj.toLocaleTimeString(),
        duration: typeof v.frameCount === "number" ? v.frameCount : 0,
        isFavorite: !!m.isFavorite,
        videoId: v.id,
        emotionData: [],
      });
    }
  } else {
    const videoIds = await getVideoIdsFromFrames();
    for (const id of videoIds) {
      const m = meta[id] || {};
      if (m.deleted) continue;
      const timestamp = m.createdAt || Date.now();
      const dateObj = new Date(timestamp);
      const frames = await getAllFrames(id);
      const approxDuration = frames.length ? frames[frames.length - 1].frameNumber : 0;
      sessions.push({
        id,
        name: m.name || `Session ${id}`,
        date: dateObj.toLocaleDateString(),
        time: dateObj.toLocaleTimeString(),
        duration: approxDuration,
        isFavorite: !!m.isFavorite,
        videoId: id,
        emotionData: [],
      });
    }
  }

  sessions.sort((a, b) => new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime());
  return sessions;
}

export async function getSessionByIdFromFirebase(sessionId: string): Promise<Session | null> {
  const sessions = await listSessionsFromFirebase();
  const base = sessions.find((s) => s.id === sessionId);
  if (!base) return null;

  const frames = await getAllFrames(base.videoId || base.id);
  const emotionData: EmotionDataPoint[] = frames.map((f, index) => {
    const detection = f.data.detections?.[0];
    if (!detection) {
      return {
        time: index,
        Angry: 0,
        Disgust: 0,
        Fear: 0,
        Happy: 0,
        Sad: 0,
        Surprise: 0,
        Neutral: 0,
      };
    }
    return {
      time: index,
      Angry: detection.emotion_scores.anger || 0,
      Disgust: detection.emotion_scores.disgust || 0,
      Fear: detection.emotion_scores.fear || 0,
      Happy: detection.emotion_scores.happiness || 0,
      Sad: detection.emotion_scores.sadness || 0,
      Surprise: detection.emotion_scores.surprise || 0,
      Neutral: detection.emotion_scores.neutral || 0,
    };
  });

  const duration = emotionData.length > 0 ? emotionData[emotionData.length - 1].time : base.duration;

  return {
    ...base,
    duration,
    emotionData,
  };
}
