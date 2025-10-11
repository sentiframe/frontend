import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMOTIONS = ["Angry", "Disgust", "Fear", "Happy", "Sad", "Surprise", "Neutral"];

const EMOTION_COLORS = {
  Angry: "bg-emotion-angry/20 border-emotion-angry text-emotion-angry hover:bg-emotion-angry/30",
  Disgust: "bg-emotion-disgust/20 border-emotion-disgust text-emotion-disgust hover:bg-emotion-disgust/30",
  Fear: "bg-emotion-fear/20 border-emotion-fear text-emotion-fear hover:bg-emotion-fear/30",
  Happy: "bg-emotion-happy/20 border-emotion-happy text-emotion-happy hover:bg-emotion-happy/30",
  Sad: "bg-emotion-sad/20 border-emotion-sad text-emotion-sad hover:bg-emotion-sad/30",
  Surprise: "bg-emotion-surprise/20 border-emotion-surprise text-emotion-surprise hover:bg-emotion-surprise/30",
  Neutral: "bg-emotion-neutral/20 border-emotion-neutral text-emotion-neutral hover:bg-emotion-neutral/30",
};

const EMOTION_COLORS_ACTIVE = {
  Angry: "bg-emotion-angry border-emotion-angry text-white",
  Disgust: "bg-emotion-disgust border-emotion-disgust text-white",
  Fear: "bg-emotion-fear border-emotion-fear text-white",
  Happy: "bg-emotion-happy border-emotion-happy text-white",
  Sad: "bg-emotion-sad border-emotion-sad text-white",
  Surprise: "bg-emotion-surprise border-emotion-surprise text-white",
  Neutral: "bg-emotion-neutral border-emotion-neutral text-white",
};

interface EmotionLegendProps {
  selectedEmotions: Set<string>;
  onToggle: (emotion: string) => void;
}

export default function EmotionLegend({ selectedEmotions, onToggle }: EmotionLegendProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Select Emotions to Display</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2" data-testid="emotion-selector">
          {EMOTIONS.map(emotion => (
            <Button
              key={emotion}
              size="sm"
              variant="outline"
              onClick={() => onToggle(emotion)}
              className={selectedEmotions.has(emotion) ? EMOTION_COLORS_ACTIVE[emotion as keyof typeof EMOTION_COLORS_ACTIVE] : EMOTION_COLORS[emotion as keyof typeof EMOTION_COLORS]}
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
