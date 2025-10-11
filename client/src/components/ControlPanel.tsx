import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Square, Download } from "lucide-react";

interface ControlPanelProps {
  isRecording: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  onExport?: () => void;
  sessionDuration?: number;
}

export default function ControlPanel({ isRecording, onStartSession, onEndSession, onExport, sessionDuration = 0 }: ControlPanelProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="shadow-[0px_2px_8px_rgba(0,0,0,0.06)] dark:shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-4 flex-wrap">
          {!isRecording ? (
            <Button 
              onClick={() => {
                onStartSession();
                console.log('Session started');
              }}
              className="gap-2"
              data-testid="button-start-session"
            >
              <Play className="w-4 h-4" />
              Start Session
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-3" data-testid="recording-indicator">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive animate-pulse-slow" />
                  <span className="text-sm font-medium">RECORDING</span>
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {formatDuration(sessionDuration)}
                </span>
              </div>
              <Button 
                variant="destructive"
                onClick={() => {
                  onEndSession();
                  console.log('Session ended');
                }}
                className="gap-2"
                data-testid="button-end-session"
              >
                <Square className="w-4 h-4" />
                End Session
              </Button>
            </>
          )}
          {onExport && !isRecording && sessionDuration > 0 && (
            <Button 
              variant="outline"
              onClick={() => {
                onExport();
                console.log('Exporting session data');
              }}
              className="gap-2"
              data-testid="button-export"
            >
              <Download className="w-4 h-4" />
              Export Data
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
