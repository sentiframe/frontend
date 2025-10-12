import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

interface CriticalMoment {
  time: number;
  from: string;
  to: string;
  severity: number;
}

interface CriticalMomentsProps {
  moments: CriticalMoment[];
  onSeek: (time: number) => void;
  currentTime: number;
}

export default function CriticalMoments({ moments, onSeek, currentTime }: CriticalMomentsProps) {
  return (
    <Card className="shadow-[0px_2px_8px_rgba(0,0,0,0.06)] dark:shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Critical Moments ({moments.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {moments.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-moments">No critical moments detected yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="grid-critical-moments">
            {moments.map((moment, i) => {
              const isActive = Math.abs(moment.time - currentTime) < 2;
              return (
                <button
                  key={i}
                  onClick={() => {
                    onSeek(moment.time);
                    console.log(`Seeking to moment at ${moment.time}s: ${moment.from} → ${moment.to}`);
                  }}
                  className={`text-left p-4 rounded-md border hover-elevate active-elevate-2 transition-all ${
                    isActive ? 'bg-muted border-primary/50' : ''
                  }`}
                  data-testid={`card-moment-${i}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-mono text-muted-foreground">{moment.time}s</div>
                    <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${Math.min(moment.severity * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <span>{moment.from}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <span>{moment.to}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Intensity: {moment.severity.toFixed(2)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
