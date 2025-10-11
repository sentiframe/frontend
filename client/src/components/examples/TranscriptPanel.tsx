import { useState } from 'react';
import TranscriptPanel from '../TranscriptPanel';

const mockSegments = [
  { time: 1, words: "Hello everyone, thank you for joining today's presentation." },
  { time: 5, words: "I'm excited to share our findings with you all." },
  { time: 10, words: "Let's begin with the overview of our research." },
  { time: 15, words: "The data shows some concerning trends we need to address." },
  { time: 20, words: "However, there's also some positive developments." },
  { time: 25, words: "We've made significant progress in the last quarter." },
  { time: 30, words: "This brings me to my next point about future strategies." },
];

export default function TranscriptPanelExample() {
  const [currentTime, setCurrentTime] = useState(15);
  
  return <TranscriptPanel segments={mockSegments} currentTime={currentTime} onSeek={setCurrentTime} />;
}
