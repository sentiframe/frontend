import SessionReport from '../SessionReport';

const mockReport = {
  summary: "The speech demonstrated strong engagement in the opening with predominantly happy and neutral emotions. However, a notable shift occurred around the 35-second mark where fear and anger briefly dominated, suggesting potential content sensitivity. The speaker recovered well in the final segment, returning to a positive emotional state. Overall emotional control was good with smooth transitions.",
  suggestions: [
    "Consider practicing the middle section where emotional intensity peaked - this may help maintain a more consistent delivery.",
    "The transition at 35 seconds could be smoother. Try to anticipate emotional shifts and modulate your tone gradually.",
    "Your opening and closing were excellent. Use the same confident energy throughout the entire presentation.",
  ],
  stats: {
    totalDuration: 120,
    emotionSwitches: 8,
    dominantEmotion: "Happy",
    dominantPercentage: 42,
  },
};

export default function SessionReportExample() {
  return <SessionReport {...mockReport} />;
}
