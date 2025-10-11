import { useState, useEffect } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionDashboard } from "@/pages/SessionDashboard";
import { LiveSession } from "@/pages/LiveSession";
import { ReportView } from "@/pages/ReportView";
import type { Session, EmotionDataPoint, CriticalMomentType } from "@shared/schema";

type View = 
  | { type: "dashboard" }
  | { type: "live-session"; sessionName: string; videoId: string }
  | { type: "report"; sessionId: string };

interface VideoMetadata {
  id: string;
  name?: string;
  description?: string;
  frameCount?: number;
}

function MainApp() {
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: Omit<Session, "id">) => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData),
      });
      return res.json() as Promise<Session>;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setCurrentSession(session);
    },
  });

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Session> }) => {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return res.json() as Promise<Session>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setView({ type: "dashboard" });
    },
  });

  // Initialize sessions from Firebase on app load
  useEffect(() => {
    const initializeSessions = async () => {
      if (initialized) return;

      try {
        // Check if sessions already exist
        const existingSessions = await fetch("/api/sessions").then(res => res.json()) as Session[];
        if (existingSessions.length >= 3) {
          setInitialized(true);
          return;
        }

        // Fetch videos from Firebase
        const videos = await fetch("/api/videos").then(res => res.json()) as VideoMetadata[];
        
        // Take up to 3 videos and create sessions for them
        const videosToProcess = videos.slice(0, 3);
        
        for (const video of videosToProcess) {
          try {
            // Fetch all frames for this video
            const frames = await fetch(`/api/frames/${video.id}/all`).then(res => res.json());
            
            if (frames.length === 0) continue;

            // Convert frames to emotion data
            const emotionData: EmotionDataPoint[] = frames.map((frame: any, index: number) => {
              const detection = frame.data.detections[0];
              if (!detection) {
                return {
                  time: index,
                  Happy: 0,
                  Sad: 0,
                  Angry: 0,
                  Fear: 0,
                  Surprise: 0,
                  Disgust: 0,
                  Neutral: 0,
                };
              }
              
              return {
                time: index,
                Happy: detection.emotion_scores.happiness || 0,
                Sad: detection.emotion_scores.sadness || 0,
                Angry: detection.emotion_scores.anger || 0,
                Fear: detection.emotion_scores.fear || 0,
                Surprise: detection.emotion_scores.surprise || 0,
                Disgust: detection.emotion_scores.disgust || 0,
                Neutral: detection.emotion_scores.neutral || 0,
              };
            });

            // Detect critical moments
            const criticalMomentsRes = await fetch("/api/critical-moments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emotionData }),
            });
            const criticalMoments = criticalMomentsRes.ok ? await criticalMomentsRes.json() : [];

            // Generate AI report
            let aiReport = undefined;
            try {
              const reportRes = await fetch("/api/report/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ frames: emotionData }),
              });
              if (reportRes.ok) {
                aiReport = await reportRes.json();
              }
            } catch (err) {
              console.error("Error generating report:", err);
            }

            const duration = emotionData.length > 0 ? emotionData[emotionData.length - 1].time : 0;
            const now = new Date();

            // Create session
            const sessionData = {
              name: video.name || `Session ${video.id}`,
              date: now.toLocaleDateString(),
              time: now.toLocaleTimeString(),
              duration,
              isFavorite: false,
              videoId: video.id,
              emotionData,
              criticalMoments,
              aiReport,
            };

            await fetch("/api/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sessionData),
            });
          } catch (err) {
            console.error(`Error processing video ${video.id}:`, err);
          }
        }

        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        setInitialized(true);
      } catch (error) {
        console.error("Error initializing sessions:", error);
        setInitialized(true);
      }
    };

    initializeSessions();
  }, [initialized]);

  const handleStartSession = () => {
    const now = new Date();
    const sessionName = `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    const videoId = "wagwan"; // Default video ID
    setView({ type: "live-session", sessionName, videoId });
  };

  const handleEndSession = async (emotionData: EmotionDataPoint[], criticalMoments: CriticalMomentType[]) => {
    if (view.type !== "live-session") return;

    const duration = emotionData.length > 0 ? emotionData[emotionData.length - 1].time : 0;
    const now = new Date();

    // Generate AI report
    let aiReport = undefined;
    try {
      const reportRes = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: emotionData }),
      });
      if (reportRes.ok) {
        aiReport = await reportRes.json();
      }
    } catch (err) {
      console.error("Error generating report:", err);
    }

    // Create session
    const sessionData = {
      name: view.sessionName,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      duration,
      isFavorite: false,
      videoId: view.videoId,
      emotionData,
      criticalMoments,
      aiReport,
    };

    createSessionMutation.mutate(sessionData, {
      onSuccess: (session) => {
        setView({ type: "report", sessionId: session.id });
      },
    });
  };

  const handleOpenSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const session = await res.json() as Session;
      setCurrentSession(session);
      setView({ type: "report", sessionId });
    } catch (err) {
      console.error("Error loading session:", err);
    }
  };

  const handleBackToDashboard = () => {
    setView({ type: "dashboard" });
    setCurrentSession(null);
  };

  const handleDeleteSession = () => {
    if (currentSession) {
      deleteSessionMutation.mutate(currentSession.id);
    }
  };

  if (view.type === "dashboard") {
    return (
      <SessionDashboard
        onStartSession={handleStartSession}
        onOpenSession={handleOpenSession}
      />
    );
  }

  if (view.type === "live-session") {
    return (
      <LiveSession
        sessionName={view.sessionName}
        videoId={view.videoId}
        onEndSession={handleEndSession}
      />
    );
  }

  if (view.type === "report" && currentSession) {
    return (
      <ReportView
        session={currentSession}
        onBackToDashboard={handleBackToDashboard}
        onDelete={handleDeleteSession}
      />
    );
  }

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <MainApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
