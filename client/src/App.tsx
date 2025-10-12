import { useState, useEffect } from "react";
import { Router, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { listSessionsFromFirebase, getSessionByIdFromFirebase, createSession } from "@/lib/sessions";
import { QueryClientProvider } from "@tanstack/react-query";
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
// No external routes

type View =
  | { type: "dashboard" }
  | { type: "session-loading"; sessionId: string }
  | { type: "live-session"; session: Session }
  | { type: "report"; sessionId: string };

function MainApp() {
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [location, setLocation] = useLocation();

  // Trigger initial session load from backend query
  useEffect(() => {
    const initializeSessions = async () => {
      if (initialized) return;

      try {
        console.info('[App] Fetching sessions from backend...');
        const sessions = await listSessionsFromFirebase();
        console.info('[App] Sessions loaded (count:', sessions.length, '):', sessions);
        sessions.forEach((session) => {
          console.info('[App] Session detail:', session);
        });
        queryClient.setQueryData(["sessions"], sessions);
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      } catch (error) {
        console.error("Error initializing sessions:", error);
      } finally {
        setInitialized(true);
      }
    };

    initializeSessions();
  }, [initialized]);

  useEffect(() => {
    if (!initialized) return;
    const match = location.match(/^\/session[:\/](.+)$/);
    if (!match) {
      setView({ type: "dashboard" });
      setCurrentSession(null);
      return;
    }
    const sessionId = decodeURIComponent(match[1]);

    const loadSession = async () => {
      try {
        const detail = await getSessionByIdFromFirebase(sessionId);
        if (!detail) {
          setView({ type: "dashboard" });
          setCurrentSession(null);
          setLocation("/");
          return;
        }
        setCurrentSession(detail);
        if (detail.emotionData?.length) {
          setView({ type: "report", sessionId: detail.id });
        } else {
          setView({ type: "live-session", session: detail });
        }
      } catch (error) {
        console.error("Failed to load session", error);
        setView({ type: "dashboard" });
        setCurrentSession(null);
        setLocation("/");
      }
    };
    setView({ type: "session-loading", sessionId });
    loadSession();
  }, [location, initialized]);

  const handleStartSession = () => {
    setShowNameDialog(true);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;
    
    setIsCreatingSession(true);
    try {
      const created = await createSession(sessionName.trim(), {});
      setShowNameDialog(false);
      setSessionName("");
      const initialSession = { ...created, emotionData: [] } as Session;
      setCurrentSession(initialSession);
      setView({ type: "live-session", session: initialSession });
      setLocation(`/session:${encodeURIComponent(created.id)}`);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err) {
      console.error("Error creating session:", err);
      alert("An error occurred while creating the session. Please try again.");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleEndSession = async (emotionData: EmotionDataPoint[], criticalMoments: CriticalMomentType[]) => {
    if (view.type !== "live-session") return;

    if (!currentSession) return;
    const updatedSession: Session = {
      ...currentSession,
      emotionData,
      criticalMoments,
    };
    setCurrentSession(updatedSession);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    setLocation(`/session:${encodeURIComponent(updatedSession.id)}`);
  };

  const handleOpenSession = async (sessionId: string) => {
    setLocation(`/session:${encodeURIComponent(sessionId)}`);
  };

  const handleBackToDashboard = () => {
    setView({ type: "dashboard" });
    setCurrentSession(null);
    setLocation("/");
  };

  const handleDeleteSession = () => {
    // No-op here; deletion is handled from dashboard UI via local meta.
  };

  return (
    <>
      {view.type === "dashboard" && (
        <SessionDashboard
          onStartSession={handleStartSession}
          onOpenSession={handleOpenSession}
        />
      )}

      {view.type === "session-loading" && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-500 shadow-sm">
            Loading session {view.sessionId}…
          </div>
        </div>
      )}

      {view.type === "live-session" && (
        <LiveSession
          session={view.session}
          onEndSession={handleEndSession}
          onBack={handleBackToDashboard}
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
        <Router>
          <MainApp />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
