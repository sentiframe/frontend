import { useState } from 'react';
import CriticalMoments from '../CriticalMoments';

const mockMoments = [
  { time: 15, from: "Happy", to: "Fear", severity: 0.65 },
  { time: 28, from: "Fear", to: "Angry", severity: 0.42 },
  { time: 35, from: "Angry", to: "Sad", severity: 0.58 },
  { time: 48, from: "Sad", to: "Happy", severity: 0.71 },
  { time: 62, from: "Happy", to: "Surprise", severity: 0.38 },
];

export default function CriticalMomentsExample() {
  const [currentTime, setCurrentTime] = useState(30);
  
  return (
    <CriticalMoments 
      moments={mockMoments} 
      onSeek={(time) => setCurrentTime(time)}
      currentTime={currentTime}
    />
  );
}
