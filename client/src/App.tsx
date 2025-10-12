import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import {
  listSessionsFromApi,
  getSessionByIdFromApi,
  createSession,
  stopSession,
} from "@/lib/sessions";
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
  | { type: "live-session"; session: Session }
  | { type: "report"; sessionId: string };

function MainApp() {
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Trigger initial session load from backend query
  useEffect(() => {
    const initializeSessions = async () => {
      if (initialized) return;

      try {
        console.info('[App] Fetching sessions from backend...');
        const sessions = await listSessionsFromApi();
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
      setCurrentSession({ ...created, emotionData: [] });
      setView({ type: "live-session", session: { ...created, emotionData: [] } });
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

    const session = view.session;
    // Stop via ngrok endpoint (POST with session name for Flask backend)
    try {
      await stopSession(session.id);
    } catch (err) {
      console.error("Error stopping session via ngrok:", err);
    }
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    setView({ type: "dashboard" });
  };

  const handleOpenSession = async (sessionId: string) => {
    try {
      const remote = await getSessionByIdFromApi(sessionId);
      if (remote) {
        setCurrentSession(remote);
        if (remote.emotionData && remote.emotionData.length > 0) {
          setView({ type: "report", sessionId });
        } else if (remote.videoId) {
          setView({ type: "live-session", session: remote });
        } else {
          setView({ type: "report", sessionId });
        }
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
