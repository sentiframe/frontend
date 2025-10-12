import { useState } from 'react';
import TimelineScrubber from '../TimelineScrubber';

export default function TimelineScrubberExample() {
  const [time, setTime] = useState(45);
  
  return (
    <TimelineScrubber 
      currentTime={time} 
      maxTime={120} 
      onSeek={setTime}
      dominantEmotion="Happy"
    />
  );
}
