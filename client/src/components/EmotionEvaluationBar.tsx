import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EmotionEvaluationBarProps {
  dominantEmotion: string;
  dominantValue: number;
  time: number;
}

const EMOTION_COLORS_BG = {
  Angry: "bg-emotion-angry",
  Disgust: "bg-emotion-disgust",
  Fear: "bg-emotion-fear",
  Happy: "bg-emotion-happy",
  Sad: "bg-emotion-sad",
  Surprise: "bg-emotion-surprise",
  Neutral: "bg-emotion-neutral",
};

export default function EmotionEvaluationBar({ dominantEmotion, dominantValue, time }: EmotionEvaluationBarProps) {
  return (
    <Card className="shadow-[0px_2px_8px_rgba(0,0,0,0.06)] dark:shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Current State @ {time}s</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-6">
          <div className="h-64 w-12 rounded-lg bg-muted relative overflow-hidden" data-testid="evaluation-bar">
            <div
              className={`absolute bottom-0 left-0 w-full transition-all duration-200 ${EMOTION_COLORS_BG[dominantEmotion as keyof typeof EMOTION_COLORS_BG] || 'bg-primary'}`}
              style={{ height: `${Math.round(dominantValue * 100)}%` }}
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Dominant Emotion</div>
            <div className="text-2xl font-bold" data-testid="text-dominant-emotion">{dominantEmotion}</div>
            <div className="text-sm font-mono text-muted-foreground">
              Value: <span data-testid="text-dominant-value">{dominantValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
