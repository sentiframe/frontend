import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

interface TimelineScrubberProps {
  currentTime: number;
  maxTime: number;
  onSeek: (time: number) => void;
  dominantEmotion?: string;
}

export default function TimelineScrubber({ currentTime, maxTime, onSeek, dominantEmotion }: TimelineScrubberProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Timeline</span>
          <div className="text-sm font-mono text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(maxTime)}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {dominantEmotion && (
            <div className="text-sm">
              Current: <span className="font-semibold">{dominantEmotion}</span>
            </div>
          )}
          <Slider 
            min={1} 
            max={maxTime || 1} 
            step={1} 
            value={[currentTime]} 
            onValueChange={(v) => {
              onSeek(v[0]);
              console.log(`Scrubbed to ${v[0]}s`);
            }}
            data-testid="slider-timeline"
          />
        </div>
      </CardContent>
    </Card>
  );
}
