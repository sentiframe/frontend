import { useCallback, useEffect, useMemo, useState } from "react";
import { startSession as startRemoteSession, getSessionByIdFromApi } from "@/lib/sessions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { EmotionDataPoint, CriticalMomentType, Session } from "@shared/schema";

interface LiveSessionProps {
  session: Session;
  onEndSession: (emotionData: EmotionDataPoint[], criticalMoments: CriticalMomentType[]) => void;
}

type EmotionType = "All" | "Happy" | "Sad" | "Angry" | "Fear" | "Surprise" | "Disgust" | "Neutral";

const EMOTION_KEYS: EmotionType[] = [
  "Happy",
  "Sad",
  "Angry",
  "Fear",
  "Surprise",
  "Disgust",
  "Neutral",
];

const EMOTION_COLORS: Record<Exclude<EmotionType, "All">, string> = {
  Happy: "#F59E0B",
  Sad: "#2563EB",
  Angry: "#EF4444",
  Fear: "#8B5CF6",
  Surprise: "#FB923C",
  Disgust: "#22C55E",
  Neutral: "#6B7280",
};

const PulsingDot = ({ cx, cy, fill }: { cx: number; cy: number; fill: string }) => (
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

export function LiveSession({ session, onEndSession }: LiveSessionProps) {
  const [emotionData, setEmotionData] = useState<EmotionDataPoint[]>(session.emotionData || []);
  const [criticalMoments, setCriticalMoments] = useState<CriticalMomentType[]>(session.criticalMoments || []);
  const [currentFrame, setCurrentFrame] = useState(
    session.emotionData?.length ? session.emotionData[session.emotionData.length - 1].time : 0,
  );
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>("All");
  const [isRecording, setIsRecording] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [chartAnimationSeed, setChartAnimationSeed] = useState(0);

  useEffect(() => {
    setEmotionData(session.emotionData || []);
    setCriticalMoments(session.criticalMoments || []);
    if (session.emotionData?.length) {
      setCurrentFrame(session.emotionData[session.emotionData.length - 1].time);
      setHasStarted(true);
    }
  }, [session]);

  useEffect(() => {
    if (!isRecording) return;
    let cancelled = false;

    const tick = async () => {
      const detail = await getSessionByIdFromApi(session.id);
      if (!detail || cancelled) return;
      setEmotionData(detail.emotionData || []);
      setCriticalMoments(detail.criticalMoments || []);
      if (detail.emotionData?.length) {
        setCurrentFrame(detail.emotionData[detail.emotionData.length - 1].time);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isRecording, session.id]);

  useEffect(() => {
    if (emotionData.length > 5) {
      const moments: CriticalMomentType[] = [];
      for (let i = 1; i < emotionData.length - 1; i++) {
        const curr = emotionData[i];
        const prev = emotionData[i - 1];
        const next = emotionData[i + 1];
        EMOTION_KEYS.forEach((emotion) => {
          const c = curr[emotion];
          const p = prev[emotion] || 0;
          const n = next[emotion] || 0;
          if (c > p && c > n && c > 0.6) {
            moments.push({
              time: curr.time,
              emotion,
              intensity: c,
              description: `${emotion} spike detected`,
            });
          }
        });
      }
      setCriticalMoments(moments);
    }
  }, [emotionData]);

  const xAxisDomain = useMemo<[number, number]>(() => {
    const maxTime = Math.max(currentFrame, 10);
    if (maxTime <= 10) return [0, 10];
    if (maxTime <= 30) return [0, 30];
    if (maxTime <= 60) return [0, 60];
    return [Math.max(0, maxTime - 60), maxTime + 10];
  }, [currentFrame]);

  const handleStartRecording = useCallback(async () => {
    if (isRecording || isStarting) return;
    setIsStarting(true);
    try {
      await startRemoteSession(session.id);
      setHasStarted(true);
      setIsRecording(true);
      setChartAnimationSeed((seed) => seed + 1);
    } catch (error) {
      console.error("Failed to start session", error);
      alert("Unable to start recording. Please try again.");
    } finally {
      setIsStarting(false);
    }
  }, [isRecording, isStarting, session.id]);

  const handleEndSession = useCallback(() => {
    setIsRecording(false);
    onEndSession(emotionData, criticalMoments);
  }, [emotionData, criticalMoments, onEndSession]);

  const handleChartHover = useCallback(() => {
    setChartAnimationSeed((seed) => seed + 1);
  }, []);

  const chartData = emotionData.length
    ? emotionData
    : [{
        time: 0,
        Happy: 0,
        Sad: 0,
        Angry: 0,
        Fear: 0,
        Surprise: 0,
        Disgust: 0,
        Neutral: 0,
      }];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 style={{ fontSize: "18px", fontWeight: 600 }}>{session.name}</h2>
            {isRecording && (
              <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600" data-testid="recording-indicator">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
                Recording
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!hasStarted ? (
              <Button
                onClick={handleStartRecording}
                data-testid="button-start-recording"
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                disabled={isStarting}
              >
                {isStarting && <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>}
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

      <main className="px-8 py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-8">
          <Card className="p-8" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Emotion Telemetry</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Live confidence scores update every second during recording.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["All", ...EMOTION_KEYS] as EmotionType[]).map((emotion) => (
                  <Button
                    key={emotion}
                    size="sm"
                    variant={selectedEmotion === emotion ? "default" : "outline"}
                    onClick={() => setSelectedEmotion(emotion)}
                  >
                    {emotion}
                  </Button>
                ))}
              </div>
            </div>

            <div className="h-80" onMouseEnter={handleChartHover}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 40, left: 0, bottom: 0 }}
                  key={chartAnimationSeed}
                  onMouseMove={(state) => setSelectedTime(state?.activeLabel ?? null)}
                  onMouseLeave={() => setSelectedTime(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="time"
                    domain={xAxisDomain}
                    tickFormatter={(value) => `${value}s`}
                  />
                  <YAxis domain={[0, 1]} tickFormatter={(value) => value.toFixed(1)} />
                  <Tooltip formatter={(value: number) => value.toFixed(3)} labelFormatter={(value) => `${value}s`} />
                  {selectedTime !== null && (
                    <ReferenceLine
                      x={selectedTime}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label={{ value: `${selectedTime}s`, position: "top", fill: "#6b7280", fontSize: 12 }}
                    />
                  )}
                  {selectedEmotion === "All"
                    ? EMOTION_KEYS.map((emotion) => (
                        <Line
                          key={emotion}
                          type="monotone"
                          dataKey={emotion}
                          stroke={EMOTION_COLORS[emotion]}
                          strokeWidth={2}
                          dot={(props: any) =>
                            props.index === emotionData.length - 1 && isRecording ? (
                              <PulsingDot {...props} fill={EMOTION_COLORS[emotion]} />
                            ) : null
                          }
                          isAnimationActive
                          animationId={chartAnimationSeed}
                        />
                      ))
                    : (
                        <Line
                          type="monotone"
                          dataKey={selectedEmotion}
                          stroke={EMOTION_COLORS[selectedEmotion]}
                          strokeWidth={3}
                          dot={(props: any) =>
                            props.index === emotionData.length - 1 && isRecording ? (
                              <PulsingDot {...props} fill={EMOTION_COLORS[selectedEmotion]} />
                            ) : null
                          }
                          isAnimationActive
                          animationId={chartAnimationSeed}
                        />
                      )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {selectedEmotion === "All" ? (
                EMOTION_KEYS.map((emotion) => (
                  <span key={emotion} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[emotion] }}></span>
                    {emotion}
                  </span>
                ))
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[selectedEmotion] }}></span>
                  Current confidence: {emotionData.length > 0 ? emotionData[emotionData.length - 1][selectedEmotion].toFixed(3) : "N/A"}
                </span>
              )}
            </div>
          </Card>

          {criticalMoments.length > 0 && (
            <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
              <h3 className="mb-4" style={{ fontSize: "18px", fontWeight: 600 }}>Critical Moments</h3>
              <div className="space-y-3">
                {criticalMoments.slice(-5).map((moment, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedTime(moment.time)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-all hover:bg-gray-50"
                    data-testid={`critical-moment-${idx}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS[moment.emotion as Exclude<EmotionType, "All">] ?? "#94a3b8" }}></span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{moment.emotion} spike • {moment.time}s</p>
                      <p className="text-xs text-muted-foreground">Intensity: {moment.intensity.toFixed(2)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
