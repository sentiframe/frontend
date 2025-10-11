import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TranscriptSegment {
  time: number;
  words: string;
}

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function TranscriptPanel({ segments, currentTime, onSeek }: TranscriptPanelProps) {
  return (
    <Card className="shadow-[0px_2px_8px_rgba(0,0,0,0.06)] dark:shadow-sm h-full">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Full Transcript</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-6 pb-4" data-testid="scroll-transcript">
          <div className="space-y-2">
            {segments.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No transcript available yet.</p>
            ) : (
              segments.map((segment, i) => {
                const isActive = segment.time === currentTime;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      onSeek(segment.time);
                      console.log(`Clicked transcript at ${segment.time}s`);
                    }}
                    className={`w-full text-left p-2 rounded-md hover-elevate transition-colors ${
                      isActive ? 'bg-muted' : ''
                    }`}
                    data-testid={`transcript-segment-${i}`}
                  >
                    <div className="flex gap-3">
                      <span className="text-xs font-mono text-muted-foreground min-w-[40px]">
                        {segment.time}s
                      </span>
                      <span className={`text-sm ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {segment.words}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
