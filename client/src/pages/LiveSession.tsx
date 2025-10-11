import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { EmotionDataPoint, CriticalMomentType, Session } from "@shared/schema";

interface LiveSessionProps {
  session: Session;
  onEndSession: (emotionData: EmotionDataPoint[], criticalMoments: CriticalMomentType[]) => void;
}

type EmotionType = "All" | "Happy" | "Sad" | "Angry" | "Fear" | "Surprise" | "Disgust" | "Neutral";

const EMOTION_COLORS = {
  Happy: "#F59E0B",
  Sad: "#3B82F6",
  Angry: "#EF4444",
  Fear: "#A855F7",
  Surprise: "#F97316",
  Disgust: "#8B5CF6",
  Neutral: "#6B7280",
};

// Custom pulsing dot component
const PulsingDot = ({ cx, cy, fill }: { cx: number; cy: number; fill: string }) => {
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={fill}
        className="animate-pulse"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={fill}
        opacity={0.3}
        className="animate-ping"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </g>
  );
};

export function LiveSession({ session, onEndSession }: LiveSessionProps) {
  const [emotionData, setEmotionData] = useState<EmotionDataPoint[]>([]);
  const [criticalMoments, setCriticalMoments] = useState<CriticalMomentType[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>("Happy");
  const [isRecording, setIsRecording] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // Calculate dynamic x-axis domain based on elapsed time
  const xAxisDomain = useMemo(() => {
    const maxTime = Math.max(currentFrame, 10);
    
    if (maxTime <= 10) {
      return [0, 10]; // First 10 seconds: show 0-10s
    } else if (maxTime <= 30) {
      return [0, 30]; // 10-30 seconds: expand to 30s
    } else if (maxTime <= 60) {
      return [0, 60]; // 30-60 seconds: expand to 1 minute
    } else {
      // Beyond 60 seconds: show last minute with some padding
      return [Math.max(0, maxTime - 60), maxTime + 10];
    }
  }, [currentFrame]);

  // Poll Firebase every second for new frame data using frame_{n} syntax
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isCancelled = false;
    
    const pollNextFrame = async (frameNum: number) => {
      if (isCancelled || !isRecording) return;
      
      const frameName = `frame_${frameNum}`;
      
      try {
        const res = await fetch(`/api/frames/${session.videoId}/${frameName}`);
        const frameData = await res.json();
        
        if (frameData && !frameData.error && frameData.detections && frameData.detections.length > 0) {
          const detection = frameData.detections[0];
          const emotions = detection.emotion_scores;
          
          const chartData: EmotionDataPoint = {
            time: frameNum,
            Angry: emotions.anger || 0,
            Disgust: emotions.disgust || 0,
            Fear: emotions.fear || 0,
            Happy: emotions.happiness || 0,
            Sad: emotions.sadness || 0,
            Surprise: emotions.surprise || 0,
            Neutral: emotions.neutral || 0,
          };
          
          const emotionValues = [
            { name: 'Angry', value: chartData.Angry },
            { name: 'Disgust', value: chartData.Disgust },
            { name: 'Fear', value: chartData.Fear },
            { name: 'Happy', value: chartData.Happy },
            { name: 'Sad', value: chartData.Sad },
            { name: 'Surprise', value: chartData.Surprise },
            { name: 'Neutral', value: chartData.Neutral },
          ];
          const dominant = emotionValues.reduce((max, curr) => curr.value > max.value ? curr : max);
          
          chartData.dominant = dominant.name;
          chartData.dominantValue = dominant.value;
          
          setEmotionData(prev => [...prev, chartData]);
          setCurrentFrame(frameNum);
        }
      } catch (err) {
        console.error(`Error fetching frame ${frameName}:`, err);
      }
      
      // Schedule next poll only after current one completes
      if (!isCancelled && isRecording) {
        timeoutId = setTimeout(() => pollNextFrame(frameNum + 1), 1000);
      }
    };
    
    if (isRecording && session.videoId) {
      pollNextFrame(currentFrame + 1);
    }
    
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isRecording, session.videoId]);

  // Detect critical moments periodically
  useEffect(() => {
    if (emotionData.length > 5) {
      fetch('/api/critical-moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emotionData }),
      })
        .then(res => res.json())
        .then(moments => setCriticalMoments(moments))
        .catch(err => console.error('Error detecting critical moments:', err));
    }
  }, [emotionData]);

  const handleStartRecording = () => {
    setHasStarted(true);
    setIsRecording(true);
  };

  const handleEndSession = () => {
    setIsRecording(false);
    onEndSession(emotionData, criticalMoments);
  };

  const getEmotionAtTime = (timeInSeconds: number, emotion: EmotionType) => {
    if (emotion === "All") return "N/A";
    
    const dataPoint = emotionData.find(d => d.time === timeInSeconds);
    if (dataPoint) return dataPoint[emotion].toFixed(3);
    
    const before = emotionData.filter(d => d.time <= timeInSeconds).slice(-1)[0];
    const after = emotionData.find(d => d.time > timeInSeconds);
    
    if (before && after) {
      const ratio = (timeInSeconds - before.time) / (after.time - before.time);
      const interpolated = before[emotion] + (after[emotion] - before[emotion]) * ratio;
      return interpolated.toFixed(3);
    }
    
    return before?.[emotion].toFixed(3) || "N/A";
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 style={{ fontSize: "18px", fontWeight: 600 }}>{session.name}</h2>
            {isRecording && (
              <span className="px-2 py-1 rounded-md bg-red-100 text-red-700 text-xs font-medium" data-testid="recording-indicator">
                ● RECORDING
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!hasStarted ? (
              <Button
                onClick={handleStartRecording}
                data-testid="button-start-recording"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Start Recording
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleEndSession}
                data-testid="button-end-session"
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                End Session
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Section */}
      <main className="px-8 py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-8">
          {/* Emotion Chart */}
          <Card className="p-8" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 style={{ fontSize: "18px", fontWeight: 600 }}>
                  {selectedEmotion === "All" ? "All Emotions Over Time" : `${selectedEmotion} Over Time`}
                </h3>
                {selectedTime !== null && selectedEmotion !== "All" && (
                  <div className="text-sm text-muted-foreground">
                    {selectedTime}s • {getEmotionAtTime(selectedTime, selectedEmotion)}
                  </div>
                )}
              </div>
              
              {/* Emotion Filter Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {(["All", "Happy", "Sad", "Angry", "Fear", "Surprise", "Disgust", "Neutral"] as EmotionType[]).map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => setSelectedEmotion(emotion)}
                    data-testid={`button-emotion-${emotion.toLowerCase()}`}
                    className={`px-3 py-1.5 rounded-md border transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-black/80 ${
                      selectedEmotion === emotion
                        ? "bg-gray-900 text-white border-gray-900"
                        : "border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                    }`}
                    style={{ fontSize: "13px" }}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={emotionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    type="number"
                    dataKey="time"
                    domain={xAxisDomain}
                    stroke="#94a3b8"
                    style={{ fontSize: "12px" }}
                    tickFormatter={(value) => `${value}s`}
                  />
                  <YAxis
                    domain={[0, 1]}
                    stroke="#94a3b8"
                    style={{ fontSize: "12px" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                    labelFormatter={(value) => `${value}s`}
                    formatter={(value: number) => value.toFixed(3)}
                  />
                  {selectedTime !== null && (
                    <ReferenceLine
                      x={selectedTime}
                      stroke="#9ca3af"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: `${selectedTime}s`,
                        position: "top",
                        fill: "#6b7280",
                        fontSize: 12,
                      }}
                    />
                  )}
                  
                  {selectedEmotion === "All" ? (
                    <>
                      <Line 
                        type="monotone" 
                        dataKey="Happy" 
                        stroke={EMOTION_COLORS.Happy} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Happy} />;
                          }
                          return <></>;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Sad" 
                        stroke={EMOTION_COLORS.Sad} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Sad} />;
                          }
                          return <></>;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Angry" 
                        stroke={EMOTION_COLORS.Angry} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Angry} />;
                          }
                          return <></>;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Fear" 
                        stroke={EMOTION_COLORS.Fear} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Fear} />;
                          }
                          return <></>;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Surprise" 
                        stroke={EMOTION_COLORS.Surprise} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Surprise} />;
                          }
                          return <></>;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Disgust" 
                        stroke={EMOTION_COLORS.Disgust} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Disgust} />;
                          }
                          return <></>;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Neutral" 
                        stroke={EMOTION_COLORS.Neutral} 
                        strokeWidth={2} 
                        dot={(props: any) => {
                          if (props.index === emotionData.length - 1 && isRecording) {
                            return <PulsingDot {...props} fill={EMOTION_COLORS.Neutral} />;
                          }
                          return <></>;
                        }}
                      />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey={selectedEmotion}
                      stroke={EMOTION_COLORS[selectedEmotion]}
                      strokeWidth={2}
                      dot={(props: any) => {
                        if (props.index === emotionData.length - 1 && isRecording) {
                          return <PulsingDot {...props} fill={EMOTION_COLORS[selectedEmotion]} />;
                        }
                        return <></>;
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {selectedEmotion === "All" ? (
                <>
                  {(Object.keys(EMOTION_COLORS) as Array<keyof typeof EMOTION_COLORS>).map((emotion) => (
                    <span key={emotion} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[emotion] }}></div>
                      {emotion}
                    </span>
                  ))}
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[selectedEmotion] }}></div>
                  Current: {emotionData.length > 0 ? emotionData[emotionData.length - 1][selectedEmotion].toFixed(3) : "N/A"}
                </span>
              )}
            </div>
          </Card>

          {/* Critical Moments */}
          {criticalMoments.length > 0 && (
            <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
              <h3 className="mb-4" style={{ fontSize: "18px", fontWeight: 600 }}>Critical Moments</h3>
              <div className="space-y-3">
                {criticalMoments.slice(-5).map((moment, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setSelectedTime(moment.time)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-all"
                    data-testid={`critical-moment-${idx}`}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS[moment.emotion as keyof typeof EMOTION_COLORS] }}></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{moment.emotion} spike at {moment.time}s</p>
                      <p className="text-xs text-muted-foreground">Intensity: {moment.intensity.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
