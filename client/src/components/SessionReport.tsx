import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface SessionReportProps {
  summary: string;
  suggestions: string[];
  stats: {
    totalDuration: number;
    emotionSwitches: number;
    dominantEmotion: string;
    dominantPercentage: number;
  };
}

export default function SessionReport({ summary, suggestions, stats }: SessionReportProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">AI-Generated Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed" data-testid="text-ai-summary">{summary}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Duration</div>
            <div className="text-2xl font-bold font-mono" data-testid="text-duration">
              {formatDuration(stats.totalDuration)}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Emotion Switches</div>
            <div className="text-2xl font-bold" data-testid="text-switches">
              {stats.emotionSwitches}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Dominant Emotion</div>
            <div className="text-2xl font-bold" data-testid="text-dominant">
              {stats.dominantEmotion}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Dominance %</div>
            <div className="text-2xl font-bold" data-testid="text-percentage">
              {stats.dominantPercentage}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Suggestions for Improvement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="list-suggestions">
            {suggestions.map((suggestion, i) => (
              <div key={i} className="flex gap-3">
                <Badge variant="outline" className="mt-0.5">{i + 1}</Badge>
                <p className="text-sm flex-1">{suggestion}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
