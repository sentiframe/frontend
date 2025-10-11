import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { Download, Trash2, ArrowLeft } from "lucide-react";
import type { Session, EmotionDataPoint, CriticalMomentType } from "@shared/schema";

interface ReportViewProps {
  session: Session;
  onBackToDashboard: () => void;
  onDelete: () => void;
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

export function ReportView({ session, onBackToDashboard, onDelete }: ReportViewProps) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>("All");

  const emotionData = session.emotionData || [];
  const criticalMoments = session.criticalMoments || [];

  const getDominantEmotion = () => {
    if (emotionData.length === 0) return { emotion: "N/A", value: "0.000" };
    
    const emotionAverages = {
      Happy: emotionData.reduce((sum, point) => sum + point.Happy, 0) / emotionData.length,
      Sad: emotionData.reduce((sum, point) => sum + point.Sad, 0) / emotionData.length,
      Angry: emotionData.reduce((sum, point) => sum + point.Angry, 0) / emotionData.length,
      Fear: emotionData.reduce((sum, point) => sum + point.Fear, 0) / emotionData.length,
      Surprise: emotionData.reduce((sum, point) => sum + point.Surprise, 0) / emotionData.length,
      Disgust: emotionData.reduce((sum, point) => sum + point.Disgust, 0) / emotionData.length,
      Neutral: emotionData.reduce((sum, point) => sum + point.Neutral, 0) / emotionData.length,
    };
    
    const dominant = Object.entries(emotionAverages).reduce((a, b) => a[1] > b[1] ? a : b);
    return { emotion: dominant[0], value: dominant[1].toFixed(3) };
  };

  const dominantEmotion = getDominantEmotion();

  const handleExport = () => {
    const csv = [
      ["Time", "Happy", "Sad", "Angry", "Fear", "Surprise", "Disgust", "Neutral"].join(","),
      ...emotionData.map(d => [d.time, d.Happy, d.Sad, d.Angry, d.Fear, d.Surprise, d.Disgust, d.Neutral].join(","))
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name}-emotion-data.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToDashboard}
              className="gap-2"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="h-6 w-px bg-gray-200"></div>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 600 }} data-testid="text-session-name">{session.name}</h2>
              <p className="text-sm text-muted-foreground" data-testid="text-session-date">{session.date} • {session.time}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} data-testid="button-export">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Are you sure you want to delete this session?")) {
                  onDelete();
                }
              }}
              className="text-red-600 border-red-200 hover:bg-red-50"
              data-testid="button-delete"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      {/* Main Section */}
      <main className="px-8 py-12 max-w-7xl mx-auto">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
            <p className="text-sm text-muted-foreground mb-2">Dominant Emotion</p>
            <p className="text-3xl font-semibold" data-testid="text-dominant">{dominantEmotion.emotion}</p>
            <p className="text-sm text-muted-foreground mt-1">Value: {dominantEmotion.value}</p>
          </Card>
          <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
            <p className="text-sm text-muted-foreground mb-2">Duration</p>
            <p className="text-3xl font-semibold" data-testid="text-duration">{formatDuration(session.duration)}</p>
          </Card>
          <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
            <p className="text-sm text-muted-foreground mb-2">Data Points</p>
            <p className="text-3xl font-semibold" data-testid="text-datapoints">{emotionData.length}</p>
          </Card>
          <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
            <p className="text-sm text-muted-foreground mb-2">Critical Moments</p>
            <p className="text-3xl font-semibold" data-testid="text-critical-count">{criticalMoments.length}</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Emotion Chart with Critical Moments */}
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

            <div className="h-80" data-testid="chart-emotion-timeline">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={emotionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    type="number"
                    dataKey="time"
                    domain={[0, Math.max(...emotionData.map(d => d.time), 100)]}
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
                  
                  {/* Critical Moments Overlay */}
                  {criticalMoments.map((moment, idx) => (
                    <ReferenceArea
                      key={idx}
                      x1={moment.time - 1}
                      x2={moment.time + 1}
                      fill={EMOTION_COLORS[moment.emotion as keyof typeof EMOTION_COLORS]}
                      fillOpacity={0.1}
                      stroke={EMOTION_COLORS[moment.emotion as keyof typeof EMOTION_COLORS]}
                      strokeOpacity={0.3}
                    />
                  ))}
                  
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
                      <Line type="monotone" dataKey="Happy" stroke={EMOTION_COLORS.Happy} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Sad" stroke={EMOTION_COLORS.Sad} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Angry" stroke={EMOTION_COLORS.Angry} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Fear" stroke={EMOTION_COLORS.Fear} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Surprise" stroke={EMOTION_COLORS.Surprise} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Disgust" stroke={EMOTION_COLORS.Disgust} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Neutral" stroke={EMOTION_COLORS.Neutral} strokeWidth={2} dot={false} />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey={selectedEmotion}
                      stroke={EMOTION_COLORS[selectedEmotion]}
                      strokeWidth={2}
                      dot={false}
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
                  {selectedEmotion} (0-1 scale)
                </span>
              )}
            </div>
          </Card>

          {/* Right Column - AI Report & Critical Moments */}
          <div className="space-y-6">
            {/* AI Report */}
            {session.aiReport && (
              <Card className="p-8" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
                <h3 className="mb-4" style={{ fontSize: "18px", fontWeight: 600 }}>AI Analysis</h3>
                <p className="text-sm leading-relaxed mb-6" data-testid="text-ai-summary">{session.aiReport.summary}</p>
                <div>
                  <h4 className="text-sm font-semibold mb-3">Suggestions</h4>
                  <ul className="space-y-2">
                    {session.aiReport.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm" data-testid={`text-suggestion-${idx}`}>
                        <span className="text-primary mt-0.5">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            )}

            {/* Critical Moments List */}
            {criticalMoments.length > 0 && (
              <Card className="p-8" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
                <h3 className="mb-4" style={{ fontSize: "18px", fontWeight: 600 }}>Critical Moments</h3>
                <div className="space-y-3">
                  {criticalMoments.map((moment, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSelectedTime(moment.time)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-all"
                      data-testid={`critical-moment-${idx}`}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: EMOTION_COLORS[moment.emotion as keyof typeof EMOTION_COLORS] }}></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{moment.emotion} spike at {moment.time}s</p>
                        <p className="text-xs text-muted-foreground">Intensity: {moment.intensity.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
