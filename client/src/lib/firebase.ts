import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  collectionGroup,
  query,
  orderBy,
  startAfter,
  limit,
  type QueryConstraint,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "AIzaSyD_NLcJ_VgpajlhDljj5IR42hCcPLbLxEw",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "sentiframess.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "sentiframess",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "sentiframess.firebasestorage.app",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "413382071467",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || ":1413382071467:web:64fbf0cbe0469aa21853ee",
  measurementId: (import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID || "G-GYNRVRZQHL",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface EmotionScores {
  anger: number;
  disgust: number;
  fear: number;
  happiness: number;
  neutral: number;
  sadness: number;
  surprise: number;
}

export interface Detection {
  emotion_scores: EmotionScores;
}

export interface FrameData {
  detections: Detection[];
}

const DEFAULT_FRAME_BATCH_SIZE = 250;
export type FrameRecord = { frameNumber: number; data: FrameData };

export interface VideoMetadata {
  id: string;
  name?: string;
  description?: string;
  frameCount?: number;
}

export async function getFrame(videoId: string, frameNumber: number): Promise<FrameData | null> {
  const ref = doc(db, `videos/${videoId}/frames/frame_${frameNumber}`);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? (snapshot.data() as FrameData) : null;
}

export async function getFrameBatch(
  videoId: string,
  options: { startAfter?: number | null; limit?: number } = {},
): Promise<FrameRecord[]> {
  const framesRef = collection(db, `videos/${videoId}/frames`);
  const batchSize = Math.max(1, Math.min(1000, options.limit ?? DEFAULT_FRAME_BATCH_SIZE));
  const constraints: QueryConstraint[] = [orderBy("frame_number", "asc"), limit(batchSize)];

  if (typeof options.startAfter === "number") {
    constraints.push(startAfter(options.startAfter));
  }

  try {
    const snapshot = await getDocs(query(framesRef, ...constraints));
    const frames: FrameRecord[] = [];
    snapshot.forEach((docSnap) => {
      const raw = docSnap.data() as FrameData & { frameNumber?: number; frame_number?: number };
      const frameNumber =
        typeof raw.frameNumber === "number"
          ? raw.frameNumber
          : typeof raw.frame_number === "number"
            ? raw.frame_number
            : parseInt(docSnap.id.replace(/\D+/g, ""), 10);
      frames.push({ frameNumber, data: raw });
    });
    frames.sort((a, b) => a.frameNumber - b.frameNumber);
    return frames;
  } catch (error) {
    // Fallback for datasets without a frameNumber field or missing indexes.
    const snapshot = await getDocs(framesRef);
    const frames: FrameRecord[] = [];
    snapshot.forEach((docSnap) => {
      const raw = docSnap.data() as FrameData & { frameNumber?: number; frame_number?: number };
      const frameNumber =
        typeof raw.frameNumber === "number"
          ? raw.frameNumber
          : typeof raw.frame_number === "number"
            ? raw.frame_number
            : parseInt(docSnap.id.replace(/\D+/g, ""), 10);
      if (typeof options.startAfter === "number" && frameNumber <= options.startAfter) {
        return;
      }
      frames.push({ frameNumber, data: raw });
    });
    frames.sort((a, b) => a.frameNumber - b.frameNumber);
    return frames.slice(0, batchSize);
  }
}

export async function getAllFrames(
  videoId: string,
  batchSize: number = DEFAULT_FRAME_BATCH_SIZE,
): Promise<FrameRecord[]> {
  const framesRef = collection(db, `videos/${videoId}/frames`);
  const frames: FrameRecord[] = [];

  try {
    let cursor: number | null = null;
    while (true) {
      const constraints: QueryConstraint[] = [orderBy("frame_number", "asc"), limit(batchSize)];
      if (cursor) {
        constraints.push(startAfter(cursor));
      }
      const snapshot = await getDocs(query(framesRef, ...constraints));
      if (snapshot.empty) {
        break;
      }

      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as FrameData & { frameNumber?: number; frame_number?: number };
        const frameNumber =
          typeof raw.frameNumber === "number"
            ? raw.frameNumber
            : typeof raw.frame_number === "number"
              ? raw.frame_number
              : parseInt(docSnap.id.replace(/\D+/g, ""), 10);
        frames.push({ frameNumber, data: raw });
      });

      const lastSnap = snapshot.docs[snapshot.docs.length - 1];
      const lastRaw = lastSnap.data() as FrameData & { frameNumber?: number; frame_number?: number };
      const lastFrameNumber =
        typeof lastRaw.frameNumber === "number"
          ? lastRaw.frameNumber
          : typeof lastRaw.frame_number === "number"
            ? lastRaw.frame_number
            : parseInt(lastSnap.id.replace(/\D+/g, ""), 10);
      cursor = lastFrameNumber;

      if (snapshot.size < batchSize) {
        break;
      }
    }

    frames.sort((a, b) => a.frameNumber - b.frameNumber);
    return frames;
  } catch (error) {
    frames.length = 0;
    const snapshot = await getDocs(framesRef);
    snapshot.forEach((docSnap) => {
      const match = docSnap.id.match(/frame_(\d+)/);
      const frameNumber = match ? parseInt(match[1], 10) : 0;
      frames.push({ frameNumber, data: docSnap.data() as FrameData });
    });
    frames.sort((a, b) => a.frameNumber - b.frameNumber);
    return frames;
  }
}

export async function getAllVideos(): Promise<VideoMetadata[]> {
  const videosRef = collection(db, "videos");
  const snapshot = await getDocs(videosRef);
  const videos: VideoMetadata[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as any;
    videos.push({
      id: docSnap.id,
      name: data?.name || docSnap.id,
      description: data?.description,
      frameCount: data?.frameCount,
    });
  });
  return videos;
}

export async function getVideoById(videoId: string): Promise<VideoMetadata | null> {
  const ref = doc(db, "videos", videoId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data() as any;
  return {
    id: snapshot.id,
    name: data?.name || snapshot.id,
    description: data?.description,
    frameCount: data?.frameCount,
  };
}

export async function getVideoIdsFromFrames(): Promise<string[]> {
  const framesGroup = await getDocs(collectionGroup(db, "frames"));
  const videoIds = new Set<string>();
  framesGroup.forEach((docSnap) => {
    const parent = docSnap.ref.parent.parent;
    if (parent) {
      videoIds.add(parent.id);
    }
  });
  return Array.from(videoIds);
}

export { app, db };
