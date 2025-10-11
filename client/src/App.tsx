import { useState, useEffect } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionDashboard } from "@/pages/SessionDashboard";
import { LiveSession } from "@/pages/LiveSession";
import { ReportView } from "@/pages/ReportView";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Session, EmotionDataPoint, CriticalMomentType } from "@shared/schema";

type View = 
  | { type: "dashboard" }
  | { type: "live-session"; session: Session }
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
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);

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
        const videosRes = await fetch("/api/videos");
        if (!videosRes.ok) {
          console.error("Failed to fetch videos from Firebase");
          setInitialized(true);
          return;
        }
        
        const videos = await videosRes.json() as VideoMetadata[];
        
        if (!videos || videos.length === 0) {
          console.log("No videos found in Firebase");
          setInitialized(true);
          return;
        }
        
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
    setShowNameDialog(true);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;
    
    setIsCreatingSession(true);
    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sessionName.trim() }),
      });
      
      if (res.ok) {
        const session = await res.json() as Session;
        setShowNameDialog(false);
        setSessionName("");
        setView({ type: "live-session", session });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create session. Please try again.");
      }
    } catch (err) {
      console.error("Error creating session:", err);
      alert("An error occurred while creating the session. Please try again.");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleEndSession = async (emotionData: EmotionDataPoint[], criticalMoments: CriticalMomentType[]) => {
    if (view.type !== "live-session") return;

    const session = view.session;
    const duration = emotionData.length > 0 ? emotionData[emotionData.length - 1].time : 0;

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

    // Update session with emotion data and report
    const updates = {
      duration,
      emotionData,
      criticalMoments,
      aiReport,
    };

    updateSessionMutation.mutate({ id: session.id, updates }, {
      onSuccess: () => {
        setView({ type: "report", sessionId: session.id });
        setCurrentSession({ ...session, ...updates });
      },
    });
  };

  const handleOpenSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const session = await res.json() as Session;
      
      // Always set current session for both views
      setCurrentSession(session);
      
      // If session has emotion data, show report view
      // Otherwise, allow user to continue recording if videoId exists
      if (session.emotionData && session.emotionData.length > 0) {
        setView({ type: "report", sessionId });
      } else if (session.videoId) {
        // Update currentSession again in case we're resuming recording
        setCurrentSession(session);
        setView({ type: "live-session", session });
      } else {
        setView({ type: "report", sessionId });
      }
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

  return (
    <>
      {view.type === "dashboard" && (
        <SessionDashboard
          onStartSession={handleStartSession}
          onOpenSession={handleOpenSession}
        />
      )}

      {view.type === "live-session" && (
        <LiveSession
          session={view.session}
          onEndSession={handleEndSession}
        />
      )}

      {view.type === "report" && currentSession && (
        <ReportView
          session={currentSession}
          onBackToDashboard={handleBackToDashboard}
          onDelete={handleDeleteSession}
        />
      )}

      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent data-testid="dialog-session-name">
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Give your session a name to help you find it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-name">Session Name</Label>
              <Input
                id="session-name"
                data-testid="input-session-name"
                placeholder="e.g., Team Meeting, Interview Practice"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sessionName.trim()) {
                    handleCreateSession();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNameDialog(false);
                setSessionName("");
              }}
              data-testid="button-cancel-session"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSession}
              disabled={!sessionName.trim() || isCreatingSession}
              data-testid="button-create-session"
            >
              {isCreatingSession ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
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
