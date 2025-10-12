import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs, collectionGroup } from "firebase/firestore";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyD_NLcJ_VgpajlhDljj5IR42hCcPLbLxEw",
  authDomain: "sentiframess.firebaseapp.com",
  projectId: "sentiframess",
  storageBucket: "sentiframess.firebasestorage.app",
  messagingSenderId: "413382071467",
  appId: "1:413382071467:web:64fbf0cbe0469aa21853ee",
  measurementId: "G-GYNRVRZQHL",
};

const app = initializeApp(firebaseConfig);

// Lazy analytics init so it does not break in non-browser contexts
if (typeof window !== "undefined") {
  analyticsSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  }).catch(() => {
    /* noop */
  });
}

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
  action_units?: any;
  emotion_scores: EmotionScores;
  face_id?: string | null;
  pose?: any;
}

export interface FrameData {
  detections: Detection[];
}

export interface VideoMetadata {
  id: string;
  name?: string;
  description?: string;
  frameCount?: number;
}

export async function getFrame(videoId: string, frameNumber: number): Promise<FrameData | null> {
  const frameDocRef = doc(db, `videos/${videoId}/frames/frame_${frameNumber}`);
  const frameSnap = await getDoc(frameDocRef);
  return frameSnap.exists() ? (frameSnap.data() as FrameData) : null;
}

export async function getAllFrames(videoId: string): Promise<{ frameNumber: number; data: FrameData }[]> {
  const framesCollectionRef = collection(db, `videos/${videoId}/frames`);
  const framesSnap = await getDocs(framesCollectionRef);
  const frames: { frameNumber: number; data: FrameData }[] = [];
  framesSnap.forEach((docSnap) => {
    const match = docSnap.id.match(/frame_(\d+)/);
    if (match) {
      frames.push({ frameNumber: parseInt(match[1], 10), data: docSnap.data() as FrameData });
    }
  });
  frames.sort((a, b) => a.frameNumber - b.frameNumber);
  return frames;
}

export async function getAllVideos(): Promise<VideoMetadata[]> {
  const videosRef = collection(db, "videos");
  const videosSnap = await getDocs(videosRef);
  const videos: VideoMetadata[] = [];
  videosSnap.forEach((docSnap) => {
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

export async function getVideoIdsFromFrames(): Promise<string[]> {
  const framesGroup = await getDocs(collectionGroup(db, "frames"));
  const videoIds = new Set<string>();
  framesGroup.forEach((frameDoc) => {
    const parent = frameDoc.ref.parent.parent;
    if (parent) {
      videoIds.add(parent.id);
    }
  });
  return Array.from(videoIds);
}

export { app, db };

export async function logAllCollections(): Promise<void> {
  console.info('[Firebase] Root collections (known): ["videos"]');
  const videos = await getAllVideos();
  console.info('[Firebase] videos docs count:', videos.length);
  if (videos.length === 0) {
    console.warn('[Firebase] No documents found under collection "videos". Ensure documents exist with at least one field.');
    const videoIds = await getVideoIdsFromFrames();
    console.info('[Firebase] Discovered video IDs from frames subcollections:', videoIds);
  }
  for (const video of videos) {
    console.info(`[Firebase] videos/${video.id} metadata:`, video);
    const framesSnap = await getDocs(collection(db, `videos/${video.id}/frames`));
    console.info(`[Firebase] videos/${video.id}/frames count:`, framesSnap.size);
    framesSnap.forEach((frameDoc) => {
      console.debug(`[Firebase] videos/${video.id}/frames/${frameDoc.id}`, frameDoc.data());
    });
  }

  const framesGroup = await getDocs(collectionGroup(db, "frames"));
  console.info('[Firebase] Total frame documents across all videos:', framesGroup.size);
  let logged = 0;
  framesGroup.forEach((frameDoc) => {
    if (logged < 20) {
      const parent = frameDoc.ref.parent.parent;
      console.debug('[Firebase] Frame doc', {
        id: frameDoc.id,
        videoId: parent?.id,
        data: frameDoc.data(),
      });
      logged += 1;
    }
  });
  if (framesGroup.size > 20) {
    console.info(`[Firebase] (Only first 20 frames logged; total ${framesGroup.size})`);
  }
}
