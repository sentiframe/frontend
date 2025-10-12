import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";
import { Download, Trash2, ArrowLeft } from "lucide-react";
import type { Session, EmotionDataPoint } from "@shared/schema";

interface ReportViewProps {
  session: Session;
  onBackToDashboard: () => void;
  onDelete: () => void;
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
  Angry: "#F87171",
  Fear: "#8B5CF6",
  Surprise: "#FB923C",
  Disgust: "#22C55E",
  Neutral: "#64748B",
};

const getEmotionColor = (emotion: EmotionType) =>
  EMOTION_COLORS[emotion as Exclude<EmotionType, "All">] ?? "#94a3b8";

type EnrichedPoint = EmotionDataPoint & {
  dominantEmotion: EmotionType;
  dominantValue: number;
};

type DominantSegment = {
  start: number;
  end: number;
  emotion: EmotionType;
};

const formatTimestamp = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(1, "0")}:${secs.toString().padStart(2, "0")}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const point: EnrichedPoint = payload[0].payload;
  const ranked = EMOTION_KEYS.map((emotion) => ({ emotion, value: point[emotion] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <p className="text-xs font-semibold text-slate-500">{formatTimestamp(label)}</p>
      <div className="mt-2 space-y-1">
        {ranked.map(({ emotion, value }) => (
          <div key={emotion} className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getEmotionColor(emotion) }}></span>
              {emotion}
            </span>
            <span className="font-medium text-slate-700">{(value * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">
        Dominant • {point.dominantEmotion} ({(point.dominantValue * 100).toFixed(1)}%)
      </div>
    </div>
  );
};

export function ReportView({ session, onBackToDashboard, onDelete }: ReportViewProps) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>("All");

  const rawEmotionData = session.emotionData || [];
  const criticalMoments = session.criticalMoments || [];

  const { emotionData, dominantSegments, dominantEmotionSummary, stats } = useMemo(() => {
    if (!rawEmotionData.length) {
      return {
        emotionData: [] as EnrichedPoint[],
        dominantSegments: [] as DominantSegment[],
        dominantEmotionSummary: { emotion: "N/A", value: 0 },
        stats: {
          points: 0,
          volatility: 0,
          transitions: 0,
          peak: 0,
        },
      };
    }

    const MAX_POINTS = 360;

    const downsample = (data: EmotionDataPoint[]): EmotionDataPoint[] => {
      if (data.length <= MAX_POINTS) return data;
      const bucketSize = Math.ceil(data.length / MAX_POINTS);
      const aggregated: EmotionDataPoint[] = [];
      for (let i = 0; i < data.length; i += bucketSize) {
        const slice = data.slice(i, i + bucketSize);
        const averaged: EmotionDataPoint = {
          time: Math.round(slice.reduce((sum, point) => sum + point.time, 0) / slice.length),
          Happy: 0,
          Sad: 0,
          Angry: 0,
          Fear: 0,
          Surprise: 0,
          Disgust: 0,
          Neutral: 0,
        };
        EMOTION_KEYS.forEach((emotion) => {
          averaged[emotion] = slice.reduce((sum, point) => sum + point[emotion], 0) / slice.length;
        });
        aggregated.push(averaged);
      }
      return aggregated;
    };

    const smooth = (data: EmotionDataPoint[], windowSize = 3): EmotionDataPoint[] => {
      if (data.length <= windowSize) return data;
      const result: EmotionDataPoint[] = [];
      for (let i = 0; i < data.length; i++) {
        const half = Math.floor(windowSize / 2);
        const slice = data.slice(Math.max(0, i - half), Math.min(data.length, i + half + 1));
        const averaged: EmotionDataPoint = {
          time: data[i].time,
          Happy: 0,
          Sad: 0,
          Angry: 0,
          Fear: 0,
          Surprise: 0,
          Disgust: 0,
          Neutral: 0,
        };
        EMOTION_KEYS.forEach((emotion) => {
          averaged[emotion] = slice.reduce((sum, point) => sum + point[emotion], 0) / slice.length;
        });
        result.push(averaged);
      }
      return result;
    };

    const smoothed = smooth(downsample(rawEmotionData)).map((point) => {
      const dominant = EMOTION_KEYS
        .map((emotion) => ({ emotion, value: point[emotion] }))
        .reduce((prev, curr) => (curr.value > prev.value ? curr : prev));
      return {
        ...point,
        dominantEmotion: dominant.emotion,
        dominantValue: dominant.value,
      } as EnrichedPoint;
    });

    const segments: DominantSegment[] = [];
    let currentEmotion: EmotionType = smoothed[0].dominantEmotion;
    let start = smoothed[0].time;
    for (let i = 1; i < smoothed.length; i++) {
      if (smoothed[i].dominantEmotion !== currentEmotion) {
        segments.push({ start, end: smoothed[i].time, emotion: currentEmotion });
        currentEmotion = smoothed[i].dominantEmotion;
        start = smoothed[i].time;
      }
    }
    segments.push({ start, end: smoothed[smoothed.length - 1].time, emotion: currentEmotion });

    const averages = EMOTION_KEYS.map((emotion) => ({
      emotion,
      value: smoothed.reduce((sum, point) => sum + point[emotion], 0) / smoothed.length,
    })).sort((a, b) => b.value - a.value);

    const volatility = smoothed.length > 1
      ? smoothed.slice(1).reduce((sum, point, idx) => {
          const prev = smoothed[idx];
          const delta = EMOTION_KEYS.reduce((acc, emotion) => acc + Math.abs(point[emotion] - prev[emotion]), 0) / EMOTION_KEYS.length;
          return sum + delta;
        }, 0) / (smoothed.length - 1)
      : 0;

    const peak = Math.max(...smoothed.map((point) => point.dominantValue));

    return {
      emotionData: smoothed,
      dominantSegments: segments,
      dominantEmotionSummary: {
        emotion: averages[0]?.emotion ?? "N/A",
        value: averages[0]?.value ?? 0,
      },
      stats: {
        points: smoothed.length,
        volatility,
        transitions: Math.max(0, segments.length - 1),
        peak,
      },
    };
  }, [rawEmotionData]);

  const handleExport = () => {
    const csv = [
      ["Time", ...EMOTION_KEYS].join(","),
      ...emotionData.map((point) => [point.time, ...EMOTION_KEYS.map((emotion) => point[emotion].toFixed(6))].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name}-emotion-data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const technicalHighlights = [
    {
      title: "Volatility Index",
      value: stats.points ? (stats.volatility * 100).toFixed(1) + "%" : "—",
      subtitle: "Avg. absolute change across emotions per second.",
    },
    {
      title: "Dominant Swaps",
      value: stats.transitions.toString(),
      subtitle: "Distinct shifts in primary emotional channel.",
    },
    {
      title: "Peak Intensity",
      value: stats.points ? (stats.peak * 100).toFixed(1) + "%" : "—",
      subtitle: "Highest dominant-emotion confidence observed.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-200/70 bg-white/90 backdrop-blur px-8 py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToDashboard}
              className="gap-2 text-slate-600 hover:bg-slate-100"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200"></div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-800" data-testid="text-session-name">
                {session.name}
              </h2>
              <p className="text-sm text-slate-500" data-testid="text-session-date">
                {session.date} • {session.time}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} data-testid="button-export" className="border-slate-200">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Are you sure you want to delete this session?")) {
                  onDelete();
                }
              }}
              className="border-red-200 text-red-600 hover:bg-red-50"
              data-testid="button-delete"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-8 py-12">
        <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <Card className="border border-slate-200/60 bg-white/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dominant Emotion</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900" data-testid="text-dominant">
              {dominantEmotionSummary.emotion}
            </p>
            <p className="text-sm text-slate-500">Mean intensity {(dominantEmotionSummary.value * 100).toFixed(1)}%</p>
          </Card>
          <Card className="border border-slate-200/60 bg-white/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900" data-testid="text-duration">
              {formatDuration(session.duration)}
            </p>
            <p className="text-sm text-slate-500">Session length</p>
          </Card>
          <Card className="border border-slate-200/60 bg-white/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Points</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900" data-testid="text-datapoints">
              {stats.points}
            </p>
            <p className="text-sm text-slate-500">After smoothing/downsampling</p>
          </Card>
          <Card className="border border-slate-200/60 bg-white/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transitions</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.transitions}</p>
            <p className="text-sm text-slate-500">Dominant emotion pivot events</p>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
          <Card
            className="overflow-hidden border border-slate-200/60 bg-white/90 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 px-8 pt-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Emotion Trajectory</h3>
                <p className="text-sm text-slate-500">
                  Smoothed sentiment layers with dominant-emotion overlays
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["All", ...EMOTION_KEYS] as EmotionType[]).map((emotion) => (
                  <Button
                    key={emotion}
                    size="sm"
                    variant={selectedEmotion === emotion ? "default" : "outline"}
                    onClick={() => setSelectedEmotion(emotion)}
                    className={selectedEmotion === emotion ? "bg-slate-900" : "border-slate-200 text-slate-600"}
                  >
                    {emotion}
                  </Button>
                ))}
              </div>
            </div>

            <div className="h-80 px-6 pb-6">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={emotionData}
                  margin={{ top: 20, right: 40, left: 0, bottom: 0 }}
                  onMouseMove={(state) => setSelectedTime(state?.activeLabel ?? null)}
                  onMouseLeave={() => setSelectedTime(null)}
                >
                  <defs>
                    <linearGradient id="dominantGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatTimestamp}
                    tick={{ fontSize: 12, fill: "#64748B" }}
                    axisLine={{ stroke: "#cbd5f5" }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    tick={{ fontSize: 12, fill: "#64748B" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={32} wrapperStyle={{ paddingBottom: 8 }} />

                  {selectedTime !== null && (
                    <ReferenceLine
                      x={selectedTime}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label={{
                        value: formatTimestamp(selectedTime),
                        position: "top",
                        fill: "#475569",
                        fontSize: 12,
                      }}
                    />
                  )}

                  {dominantSegments.map((segment, idx) => (
                    <ReferenceArea
                      key={`${segment.emotion}-${idx}`}
                      x1={segment.start}
                      x2={segment.end}
                      strokeOpacity={0}
                      fill={getEmotionColor(segment.emotion)}
                      fillOpacity={selectedEmotion === "All" ? 0.06 : 0.03}
                    />
                  ))}

                  {emotionData.length > 0 && (
                    <Area type="monotone" dataKey="dominantValue" stroke="none" fill="url(#dominantGradient)" />
                  )}

                  {(selectedEmotion === "All" ? EMOTION_KEYS : [selectedEmotion]).map((emotion) => (
                    <Line
                      key={emotion}
                      type="natural"
                      dataKey={emotion}
                      stroke={getEmotionColor(emotion)}
                      strokeWidth={selectedEmotion === "All" ? 2 : 3}
                      dot={false}
                      strokeOpacity={selectedEmotion === "All" ? 0.85 : 1}
                      activeDot={{ r: 4 }}
                      name={emotion}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="px-8 pb-8">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Dominant Emotion Timeline</h4>
                <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full">
                  {dominantSegments.map((segment, idx) => (
                    <div
                      key={`${segment.emotion}-${idx}`}
                      style={{
                        backgroundColor: getEmotionColor(segment.emotion),
                        flex: `${segment.end - segment.start} 0 auto`,
                        opacity: 0.7,
                      }}
                      title={`${segment.emotion} • ${formatTimestamp(segment.start)} – ${formatTimestamp(segment.end)}`}
                    ></div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {EMOTION_KEYS.map((emotion) => (
                    <span key={emotion} className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getEmotionColor(emotion) }}></span>
                      {emotion}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="border border-emerald-200/60 bg-white/90 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">AI Technical Assessment</h3>
              {session.aiReport ? (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700" data-testid="text-ai-summary">
                    {session.aiReport.summary}
                  </p>
                  <div className="mt-4 space-y-3">
                    {session.aiReport.suggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-emerald-200/60 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900"
                        data-testid={`text-suggestion-${idx}`}
                      >
                        {suggestion}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  We’re ready to ingest transcripts alongside emotional telemetry. Once transcripts land, insights will triangulate linguistic cadence, sentiment volatility, and conversational pivots to surface executive-grade coaching guidance.
                </p>
              )}
            </Card>

            <Card className="border border-slate-200/60 bg-white/90 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Technical Highlights</h3>
              <div className="mt-4 space-y-4">
                {technicalHighlights.map((item) => (
                  <div key={item.title} className="rounded-xl bg-slate-50/80 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.title}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{item.value}</div>
                    <div className="text-xs text-slate-500">{item.subtitle}</div>
                  </div>
                ))}
              </div>
            </Card>

            {criticalMoments.length > 0 && (
              <Card className="border border-amber-200/60 bg-white/90 p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Critical Moments</h3>
                <div className="mt-4 space-y-3">
                  {criticalMoments.map((moment, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedTime(moment.time)}
                      className="w-full rounded-xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-left text-sm text-amber-900 transition-all hover:border-amber-300 hover:bg-amber-100"
                      data-testid={`critical-moment-${idx}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{moment.emotion} spike</span>
                        <span className="text-xs font-semibold">{formatTimestamp(moment.time)}</span>
                      </div>
                      <div className="mt-1 text-xs opacity-80">Intensity {moment.intensity.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </section>

        {emotionData.length > 0 && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {EMOTION_KEYS.slice(0, 3).map((emotion) => {
              const values = emotionData.map((point) => point[emotion]);
              const mean = values.reduce((a, b) => a + b, 0) / values.length;
              const peak = Math.max(...values);
              return (
                <Card key={emotion} className="border border-slate-200/60 bg-white/90 p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{emotion}</p>
                      <p className="text-2xl font-semibold text-slate-900">{(mean * 100).toFixed(1)}%</p>
                    </div>
                    <div className="h-10 w-10 rounded-full" style={{ backgroundColor: `${getEmotionColor(emotion)}22` }}>
                      <div className="m-2 h-6 w-6 rounded-full" style={{ backgroundColor: getEmotionColor(emotion) }}></div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Peak { (peak * 100).toFixed(1)}%</p>
                </Card>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
