import { useState, useEffect } from 'react';
import ControlPanel from '../ControlPanel';

export default function ControlPanelExample() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <ControlPanel 
      isRecording={isRecording}
      onStartSession={() => setIsRecording(true)}
      onEndSession={() => setIsRecording(false)}
      onExport={() => {}}
      sessionDuration={duration}
    />
  );
}
