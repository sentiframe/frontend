import EmotionChart from '../EmotionChart';

const mockData = Array.from({ length: 60 }, (_, i) => ({
  time: i + 1,
  Angry: Math.random() * 0.3,
  Disgust: Math.random() * 0.2,
  Fear: Math.random() * 0.4,
  Happy: 0.5 + Math.random() * 0.3,
  Sad: Math.random() * 0.25,
  Surprise: Math.random() * 0.35,
  Neutral: Math.random() * 0.4,
}));

export default function EmotionChartExample() {
  return (
    <EmotionChart 
      data={mockData} 
      selectedEmotions={new Set(["Happy", "Sad", "Angry", "Fear"])}
      criticalMoments={[{ time: 15 }, { time: 35 }, { time: 48 }]}
      currentTime={30}
    />
  );
}
