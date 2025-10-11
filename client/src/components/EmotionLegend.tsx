import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMOTIONS = ["Angry", "Disgust", "Fear", "Happy", "Sad", "Surprise", "Neutral"];

const EMOTION_COLORS = {
  Angry: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
  Disgust: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
  Fear: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
  Happy: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
  Sad: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
  Surprise: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
  Neutral: "border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-accent",
};

const EMOTION_COLORS_ACTIVE = {
  Angry: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
  Disgust: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
  Fear: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
  Happy: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
  Sad: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
  Surprise: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
  Neutral: "bg-gray-900 dark:bg-primary text-white border-gray-900 dark:border-primary",
};

interface EmotionLegendProps {
  selectedEmotions: Set<string>;
  onToggle: (emotion: string) => void;
}

export default function EmotionLegend({ selectedEmotions, onToggle }: EmotionLegendProps) {
  return (
    <Card className="shadow-[0px_2px_8px_rgba(0,0,0,0.06)] dark:shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Select Emotions to Display</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5" data-testid="emotion-selector">
          {EMOTIONS.map(emotion => (
            <Button
              key={emotion}
size="sm"
              variant="outline"
              onClick={() => onToggle(emotion)}
              className={`rounded-md transition-all duration-120 ${selectedEmotions.has(emotion) ? EMOTION_COLORS_ACTIVE[emotion as keyof typeof EMOTION_COLORS_ACTIVE] : EMOTION_COLORS[emotion as keyof typeof EMOTION_COLORS]}`}
              style={{ fontSize: "13px" }}
              data-testid={`button-toggle-${emotion.toLowerCase()}`}
            >
              {emotion}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
