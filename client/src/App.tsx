import { useState } from "react";
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

function MainApp() {
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

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
