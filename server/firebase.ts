import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
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
  action_units?: any;
  emotion_scores: EmotionScores;
  face_id?: string | null;
  pose?: any;
}

export interface FrameData {
  detections: Detection[];
}

export async function getFrame(videoId: string, frameNumber: number): Promise<FrameData | null> {
  try {
    const frameDocRef = doc(db, `videos/${videoId}/frames/frame_${frameNumber}`);
    const frameSnap = await getDoc(frameDocRef);

    if (frameSnap.exists()) {
      return frameSnap.data() as FrameData;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching frame ${frameNumber}:`, error);
    return null;
  }
}

export async function getAllFrames(videoId: string): Promise<{ frameNumber: number, data: FrameData }[]> {
  try {
    const framesCollectionRef = collection(db, `videos/${videoId}/frames`);
    const framesSnap = await getDocs(framesCollectionRef);
    
    const frames: { frameNumber: number, data: FrameData }[] = [];
    framesSnap.forEach((docSnap) => {
      const frameNumberMatch = docSnap.id.match(/frame_(\d+)/);
      if (frameNumberMatch) {
        frames.push({
          frameNumber: parseInt(frameNumberMatch[1]),
          data: docSnap.data() as FrameData
        });
      }
    });

    frames.sort((a, b) => a.frameNumber - b.frameNumber);
    return frames;
  } catch (error) {
    console.error(`Error fetching all frames for video ${videoId}:`, error);
    return [];
  }
}

export interface VideoMetadata {
  id: string;
  name?: string;
  description?: string;
  frameCount?: number;
}

export async function getAllVideos(): Promise<VideoMetadata[]> {
  try {
    const videosCollectionRef = collection(db, "videos");
    const videosSnap = await getDocs(videosCollectionRef);
    
    const videos: VideoMetadata[] = [];
    videosSnap.forEach((docSnap) => {
      const data = docSnap.data();
      videos.push({
        id: docSnap.id,
        name: data.name || docSnap.id,
        description: data.description,
        frameCount: data.frameCount,
      });
    });

    return videos;
  } catch (error) {
    console.error("Error fetching videos:", error);
    return [];
  }
}

export { db };
