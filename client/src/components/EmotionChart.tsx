import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMOTION_COLORS = {
  Angry: "hsl(var(--emotion-angry))",
  Disgust: "hsl(var(--emotion-disgust))",
  Fear: "hsl(var(--emotion-fear))",
  Happy: "hsl(var(--emotion-happy))",
  Sad: "hsl(var(--emotion-sad))",
  Surprise: "hsl(var(--emotion-surprise))",
  Neutral: "hsl(var(--emotion-neutral))",
};

interface EmotionChartProps {
  data: any[];
  selectedEmotions: Set<string>;
  criticalMoments?: Array<{ time: number }>;
  currentTime?: number;
}

export default function EmotionChart({ data, selectedEmotions, criticalMoments = [], currentTime }: EmotionChartProps) {
  return (
    <Card className="shadow-[0px_2px_8px_rgba(0,0,0,0.06)] dark:shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Emotion Timeline (0-1 Scale)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full" data-testid="chart-emotion-timeline">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis 
                dataKey="time" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
              />
              <YAxis 
                domain={[0, 1]} 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              {Object.entries(EMOTION_COLORS).map(([emotion, color]) => (
                selectedEmotions.has(emotion) && (
                  <Line 
                    key={emotion}
                    type="monotone" 
                    dataKey={emotion} 
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    name={emotion}
                  />
                )
              ))}
              {criticalMoments.map((moment, idx) => (
                <ReferenceLine 
                  key={idx} 
                  x={moment.time} 
                  stroke="hsl(var(--primary))" 
                  strokeDasharray="4 4" 
                  strokeOpacity={0.5} 
                />
              ))}
              {currentTime !== undefined && (
                <ReferenceLine 
                  x={currentTime} 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
