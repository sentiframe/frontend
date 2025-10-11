import { useState } from 'react';
import EmotionLegend from '../EmotionLegend';

export default function EmotionLegendExample() {
  const [selected, setSelected] = useState(new Set(["Happy", "Sad", "Angry"]));
  
  const handleToggle = (emotion: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(emotion)) {
      newSelected.delete(emotion);
    } else {
      newSelected.add(emotion);
    }
    setSelected(newSelected);
    console.log(`Toggled ${emotion}, now selected:`, Array.from(newSelected));
  };
  
  return <EmotionLegend selectedEmotions={selected} onToggle={handleToggle} />;
}
