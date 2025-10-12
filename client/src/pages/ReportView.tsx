import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeOutliersOnce } from "@/lib/analytics/outliers";
import elevenlabsLogo from "@/assets/elevenlabs.png";
import geminiLogo from "@/assets/google-gemini.png";


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
  ReferenceDot,
  Legend,
} from "recharts";
import { Download, Trash2, ArrowLeft, Play, Pause, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Session, EmotionDataPoint } from "@shared/schema";
import type { PersonEmotionBreakdown } from "@/lib/sessions";

/** ---------- API TYPES ---------- */
type SummaryStatus = "processing" | "completed" | "error" | "not_found";

interface TranscriptSegment {
  timestamp: string; // "MM:SS"
  text: string;
}

interface HighlightedSegment {
  segment_id: number;
  exact_text: string;
  reason_for_selection: string;
}

interface AudioSegment {
  exact_text: string;
  audio_file_url: string; // may be relative
  file_size_kb: number;
}

interface SummaryCompletedResult {
  cleaned_transcript: TranscriptSegment[];
  highlighted_segments: HighlightedSegment[];
  audio_segments: AudioSegment[];
  metadata: {
    total_segments: number;
    critical_segments_count: number;
    audio_files_generated: number;
    voice_tonality: string;
  };
}

interface SummaryResponse {
  status: SummaryStatus;
  session_name: string;
  result?: SummaryCompletedResult;
  error?: string;
  started_at?: string;
  generated_at?: string;
}

/** ---------- NGROK/PROXY CONFIG ---------- */
// Use the proxy in dev (empty base). In prod, require VITE_API_BASE.
const API_BASE =
  (import.meta.env.DEV ? "" : (import.meta as any)?.env?.VITE_API_BASE) ?? "";

/** Join base + path safely */
function joinUrl(base: string, path: string) {
  if (!path) return base || "/";
  try {
    return new URL(path).toString(); // already absolute
  } catch {}
  if (!base) return path.startsWith("/") ? path : `/${path}`;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function fetchSummary(sessionName: string): Promise<SummaryResponse> {
  const url = joinUrl(API_BASE, `/api/summary/${encodeURIComponent(sessionName)}`);
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    const text = await res.text();
    throw new Error(
      `Got HTML instead of JSON from ${url}. Proxy/path likely misconfigured.\n${text.slice(0, 200)}...`
    );
  }

  if (res.status === 404) return { status: "not_found", session_name: sessionName };
  if (!res.ok) throw new Error(`Backend error ${res.status}: ${res.statusText}`);

  return (await res.json()) as SummaryResponse;
}

/** ---------- EXISTING TYPES/CONSTS ---------- */
interface ReportViewProps {
  session: Session;
  onBackToDashboard: () => void;
  onDelete: () => void;
}

type EmotionType =
  | "Happy"
  | "Sad"
  | "Angry"
  | "Fear"
  | "Surprise"
  | "Disgust"
  | "Neutral";
type EmotionSelection = "Dominant" | "All" | EmotionType;

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
  Surprise: "#EC4899",
  Disgust: "#22C55E",
  Neutral: "#64748B",
};

const getEmotionColor = (emotion: EmotionType) =>
  EMOTION_COLORS[emotion as Exclude<EmotionType, "All">] ?? "#94a3b8";

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const int = parseInt(n, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

const CustomTooltip = ({ active, payload, label, getShiftLabelAt }: any) => {
  if (!active || !payload?.length) return null;
  const point: EnrichedPoint = payload[0].payload;
  const ranked = EMOTION_KEYS.map((emotion) => ({ emotion, value: point[emotion] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const shiftText = typeof label === "number" && typeof getShiftLabelAt === "function"
    ? getShiftLabelAt(label)
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <p className="text-xs font-semibold text-slate-500">{formatTimestamp(label)}</p>
      <div className="mt-2 space-y-1">
        {ranked.map(({ emotion, value }) => (
          <div key={emotion} className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getEmotionColor(emotion) }}
              />
              {emotion}
            </span>
            <span className="font-medium text-slate-700">{(value * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">
        Dominant - {point.dominantEmotion} ({(point.dominantValue * 100).toFixed(1)}%)
      </div>
      {shiftText && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
          {shiftText}
        </div>
      )}
    </div>
  );
};

/** ---------- HELPER: map highlights -> transcript rows with audio ---------- */
type TranscriptRow = TranscriptSegment & {
  isHighlighted: boolean;
  highlight?: HighlightedSegment;
  audio?: AudioSegment;
};

function stitchTranscript(
  transcript: TranscriptSegment[],
  highlights: HighlightedSegment[],
  audios: AudioSegment[]
): TranscriptRow[] {
  const rows: TranscriptRow[] = transcript.map((seg) => ({ ...seg, isHighlighted: false }));

  highlights.forEach((h) => {
    const idx = rows.findIndex((r) => r.text.includes(h.exact_text));
    if (idx >= 0) {
      rows[idx].isHighlighted = true;
      rows[idx].highlight = h;
    }
  });

  audios.forEach((a) => {
    const idx = rows.findIndex((r) => r.text.includes(a.exact_text));
    if (idx >= 0) {
      rows[idx].audio = a;
    }
  });

  return rows;
}

/** ---------- Critical moment helpers ---------- */
function getSegmentForTime(segments: DominantSegment[], t: number): DominantSegment | null {
  for (const s of segments) {
    if (t >= s.start && t <= s.end) {
      return s;
    }
  }
  return null;
}

function findDominantAt(segments: DominantSegment[], t: number): EmotionType {
  const seg = getSegmentForTime(segments, t);
  return seg ? seg.emotion : "Neutral";
}

type CritKind =
  | { type: "spike" }
  | { type: "shift"; from: EmotionType; to: EmotionType }
  | { type: "dominant_nonpeak" };

type CriticalShiftNode = {
  x: number;
  y: number;
  time: number;
  emotion: EmotionType;
  label: string;
  reason: string;
  intensity: number;
  from: EmotionType;
  to: EmotionType;
};

function classifyMoment(
  t: number,
  mEmotion: EmotionType,
  segments: DominantSegment[],
  data: EnrichedPoint[]
): CritKind {
  const dom = findDominantAt(segments, t);
  if (dom !== mEmotion) {
    return { type: "shift", from: dom, to: mEmotion };
  }

  const seg = getSegmentForTime(segments, t);
  if (!seg) return { type: "dominant_nonpeak" };

  let maxVal = -Infinity;
  let atTVal: number | null = null;
  const EPS = 1e-5;

  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    if (p.time < seg.start - EPS || p.time > seg.end + EPS) continue;
    const v = p[mEmotion];
    if (v > maxVal) maxVal = v;
    if (Math.abs(p.time - t) < EPS) {
      atTVal = v;
    }
  }

  if (atTVal == null) {
    let nearestIdx = -1;
    let best = Number.MAX_VALUE;
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      if (p.time < seg.start - EPS || p.time > seg.end + EPS) continue;
      const d = Math.abs(p.time - t);
      if (d < best) {
        best = d;
        nearestIdx = i;
      }
    }
    if (nearestIdx >= 0) {
      atTVal = data[nearestIdx][mEmotion];
    }
  }

  if (atTVal == null) return { type: "dominant_nonpeak" };

  const isPeak = atTVal >= maxVal - 1e-4;
  return isPeak ? { type: "spike" } : { type: "dominant_nonpeak" };
}

function CritBubbleLabel(props: any) {
  const { viewBox, value } = props;
  if (!viewBox) return null;

  const paddingX = 8;
  const radius = 8;
  const textYShift = -18;
  const x = viewBox.x;
  const y = viewBox.y;
  const text = String(value ?? "");
  const estCharW = 6.8;
  const width = Math.max(60, paddingX * 2 + text.length * estCharW);
  const height = 26;
  const placeBelow = y < 90;
  const bubbleY = placeBelow ? y + 10 : y + textYShift - height;

  return (
    <g>
      <rect
        x={x - width / 2}
        y={bubbleY}
        width={width}
        height={height}
        rx={radius}
        ry={radius}
        fill="rgba(255,255,255,0.95)"
        stroke="#CBD5E1"
      />
      <text
        x={x}
        y={bubbleY + height / 2 + 4}
        textAnchor="middle"
        fontSize={12}
        fill="#334155"
        style={{ fontWeight: 600 }}
      >
        {text}
      </text>
    </g>
  );
}

/** ---------- Confidence flags (stats-based; only when > 3 people) ---------- */
type ConfidenceFlag = {
  personId: string;
  type: "low_confidence_outlier";
  zScore: number;
  note: string;
};

/** ===================== MAIN COMPONENT ===================== */
export function ReportView({ session, onBackToDashboard, onDelete }: ReportViewProps) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionSelection>("Dominant");
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const [flashChart, setFlashChart] = useState(false);
  const [delayDone, setDelayDone] = useState(true);
  const delayTimerRef = useRef<number | undefined>(undefined);
  
  const [hoveredShift, setHoveredShift] = useState<number | null>(null);

  const restartDelay = useCallback(() => {
    if (delayTimerRef.current   !== undefined) {
      window.clearTimeout(delayTimerRef.current);
    }
    setDelayDone(false);
    delayTimerRef.current = window.setTimeout(() => setDelayDone(true), 10000);
  }, []);

  useEffect(() => {
    if (!flashChart) return;
    const timer = window.setTimeout(() => setFlashChart(false), 1200);
    return () => window.clearTimeout(timer);
  }, [flashChart]);

  /** -------- Summary polling from backend -------- */
  const query = useQuery<SummaryResponse, Error>({
    queryKey: ["summary", session.name],
    queryFn: () => fetchSummary(session.name),
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 2000 : false),
    refetchOnWindowFocus: false,
  });

  const summaryData = query.data;
  const isFetching = query.isFetching;
  const refetch = query.refetch;

  const rawEmotionData = session.emotionData || [];
  const peopleBreakdown = useMemo<PersonEmotionBreakdown[]>(() => {
    const raw = (session as any)?.peopleBreakdown;
    if (!Array.isArray(raw)) return [];

    return raw.map((entry: any, idx: number) => {
      const id = typeof entry?.id === "string" ? entry.id : `person-${idx + 1}`;
      const label = typeof entry?.label === "string" ? entry.label : id;
      const dominantEmotionRaw = entry?.dominantEmotion ?? entry?.dominant_emotion;
      const dominantEmotion = EMOTION_KEYS.includes(dominantEmotionRaw)
        ? (dominantEmotionRaw as EmotionType)
        : "Neutral";
      const dominantValue = typeof entry?.dominantValue === "number"
        ? entry.dominantValue
        : typeof entry?.dominant_value === "number"
        ? entry.dominant_value
        : 0;
      const framesObserved = typeof entry?.framesObserved === "number"
        ? entry.framesObserved
        : typeof entry?.frames_observed === "number"
        ? entry.frames_observed
        : 0;

      const emotions: Record<EmotionType, number> = {} as Record<EmotionType, number>;
      EMOTION_KEYS.forEach((emotion) => {
        const source = entry?.emotions ?? {};
        const candidate = source?.[emotion] ?? source?.[emotion.toLowerCase()];
        emotions[emotion] = typeof candidate === "number" ? candidate : 0;
      });

      const notes = Array.isArray(entry?.notes)
        ? entry.notes.filter((note: unknown) => typeof note === "string")
        : [];

      return {
        id,
        label,
        dominantEmotion,
        dominantValue,
        emotions,
        framesObserved,
        notes,
      };
    });
  }, [session]);

  const {
    emotionData,
    dominantSegments,
    dominantEmotionSummary,
    stats,
  } = useMemo(() => {
    if (!rawEmotionData.length) {
      return {
        emotionData: [] as EnrichedPoint[],
        dominantSegments: [] as DominantSegment[],
        dominantEmotionSummary: { emotion: "Neutral" as EmotionType, value: 0 },
        stats: { points: 0, volatility: 0, transitions: 0, peak: 0 },
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
          averaged[emotion] =
            slice.reduce((sum, point) => sum + point[emotion], 0) / slice.length;
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
        const slice = data.slice(
          Math.max(0, i - half),
          Math.min(data.length, i + half + 1)
        );
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
          averaged[emotion] =
            slice.reduce((sum, point) => sum + point[emotion], 0) / slice.length;
        });
        result.push(averaged);
      }
      return result;
    };

    const smoothed = smooth(downsample(rawEmotionData)).map((point) => {
      const dominant = EMOTION_KEYS.map((emotion) => ({ emotion, value: point[emotion] })).reduce(
        (prev, curr) => (curr.value > prev.value ? curr : prev)
      );
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

    const volatility =
      smoothed.length > 1
        ? smoothed.slice(1).reduce((sum, point, idx) => {
            const prev = smoothed[idx];
            const delta =
              EMOTION_KEYS.reduce(
                (acc, emotion) => acc + Math.abs(point[emotion] - prev[emotion]),
                0
              ) / EMOTION_KEYS.length;
            return sum + delta;
          }, 0) /
          (smoothed.length - 1)
        : 0;

    const peak = Math.max(...smoothed.map((point) => point.dominantValue));

    return {
      emotionData: smoothed,
      dominantSegments: segments,
      dominantEmotionSummary: {
        emotion: (averages[0]?.emotion ?? "Neutral") as EmotionType,
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

  const criticalShiftNodes = useMemo(() => {
    if (!emotionData.length || dominantSegments.length < 2) return [] as CriticalShiftNode[];

    const idxByTime = (t: number) => {
      let closest = 0;
      let best = Number.MAX_VALUE;
      for (let i = 0; i < emotionData.length; i++) {
        const diff = Math.abs(emotionData[i].time - t);
        if (diff < best) {
          best = diff;
          closest = i;
        }
      }
      return closest;
    };

    const nodes: CriticalShiftNode[] = [];

    for (let i = 1; i < dominantSegments.length; i++) {
      const prev = dominantSegments[i - 1];
      const current = dominantSegments[i];
      if (prev.emotion === current.emotion) continue;
      const idx = idxByTime(current.start);
      const point = emotionData[idx] ?? emotionData[emotionData.length - 1];
      const y = point?.dominantValue ?? 0;
      nodes.push({
        x: point?.time ?? current.start,
        y,
        time: current.start,
        emotion: current.emotion,
        label: `Shift: ${prev.emotion} -> ${current.emotion}`,
        reason: `Regime change ${prev.emotion} -> ${current.emotion}`,
        intensity: Math.max(y, point?.dominantValue ?? 0),
        from: prev.emotion,
        to: current.emotion,
      });
    }

    nodes.sort((a, b) => b.intensity - a.intensity);
    return nodes.slice(0, 3);
  }, [dominantSegments, emotionData]);

  /** --- Critical moment nodes: find y at specific time (nearest point) --- */
const dominantStrokeGradient = useMemo(() => {
    if (!emotionData.length) {
      return {
        id: "dominant-stroke",
        stops: [
          { offset: "0%", color: getEmotionColor("Neutral" as EmotionType) },
          { offset: "100%", color: getEmotionColor("Neutral" as EmotionType) },
        ],
      };
    }
    const maxTime = emotionData[emotionData.length - 1].time || 1;
    const id = `dominant-stroke-${dominantSegments.length}-${emotionData.length}`;
    const stops: Array<{ offset: string; color: string }> = [];
    dominantSegments.forEach((segment) => {
      const safeStart = Math.max(0, Math.min(1, segment.start / maxTime));
      const safeEnd = Math.max(safeStart, Math.min(1, segment.end / maxTime));
      const color = getEmotionColor(segment.emotion);
      stops.push({ offset: `${safeStart * 100}%`, color });
      stops.push({ offset: `${safeEnd * 100}%`, color });
    });
    if (!stops.length) {
      const color = getEmotionColor("Neutral" as EmotionType);
      stops.push({ offset: "0%", color });
      stops.push({ offset: "100%", color });
    }
    return { id, stops };
  }, [dominantSegments, emotionData]);
  const lineConfigs = useMemo(() => {
    if (selectedEmotion === "All") {
      return EMOTION_KEYS.map((emotion) => ({
        key: emotion,
        name: emotion,
        stroke: getEmotionColor(emotion),
        strokeWidth: 2,
        strokeOpacity: 0.85,
      }));
    }
    if (selectedEmotion === "Dominant") {
      return [
        {
          key: "dominantValue",
          name: "Dominant",
          stroke: `url(#${dominantStrokeGradient.id})`,
          strokeWidth: 3,
          strokeOpacity: 1,
        },
      ];
    }
    return [
      {
        key: selectedEmotion,
        name: selectedEmotion,
        stroke: getEmotionColor(selectedEmotion as EmotionType),
        strokeWidth: 3,
        strokeOpacity: 1,
      },
    ];
  }, [selectedEmotion, /* eslint-disable-line */]);

  

  const handleExport = () => {
    const csv = [
      ["Time", ...EMOTION_KEYS].join(","),
      ...emotionData.map((point) =>
        [point.time, ...EMOTION_KEYS.map((emotion) => point[emotion].toFixed(6))].join(",")
      ),
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

  // color tokens for dominant card
  const dominantHex = getEmotionColor(dominantEmotionSummary.emotion as EmotionType);
  const domBgStrong = hexToRgba(dominantHex, 0.18);
  const domBgSoft = hexToRgba(dominantHex, 0.06);
  const domBorder = hexToRgba(dominantHex, 0.28);
  const domDot = dominantHex;

  const getShiftLabelAt = useCallback(
    (time: number): string | null => {
      if (!criticalShiftNodes.length) return null;
      let best: { label: string; dist: number } | null = null;
      for (const n of criticalShiftNodes) {
        const dist = Math.abs(n.time - time);
        if (!best || dist < best.dist) best = { label: n.label, dist };
      }
      // Only consider a shift "nearby" if within ~1s
      return best && best.dist <= 1 ? best.label : null;
    },
    [criticalShiftNodes]
  );

  /** ---------- Transcript + Highlights stitched ---------- */
  const rows: TranscriptRow[] = useMemo(() => {
    if (summaryData?.status !== "completed" || !summaryData.result) return [];
    return stitchTranscript(
      summaryData.result.cleaned_transcript ?? [],
      summaryData.result.highlighted_segments ?? [],
      summaryData.result.audio_segments ?? []
    );
  }, [summaryData]);
  const summaryStatus: SummaryStatus = summaryData?.status ?? "processing";
  const overlayActive = !delayDone || summaryStatus === "processing";

  /** ---------- Outlier snapshot flags ---------- */
  const outliersReport = useMemo(
    () => computeOutliersOnce(peopleBreakdown || []),
    [peopleBreakdown]
  );
  const flaggedIds = outliersReport.flagged ?? new Set<string>();
  const showGroupLowConfidence = outliersReport.showGroupLowConfidence;

  const findNearestAudioUrlAt = (timeSec: number): string | null => {
    if (summaryData?.status !== "completed" || !summaryData.result) return null;
    const audios = summaryData.result.audio_segments ?? [];
    if (!audios.length) return null;

    const toSeconds = (stamp: string) => {
      const [mm = "0", ss = "0"] = stamp.split(":");
      return Number(mm) * 60 + Number(ss);
    };

    if (!rows.length) return null;

    let bestIdx = -1;
    let bestDist = Number.MAX_VALUE;
    rows.forEach((row, idx) => {
      const diff = Math.abs(toSeconds(row.timestamp) - timeSec);
      if (diff < bestDist) {
        bestDist = diff;
        bestIdx = idx;
      }
    });
    if (bestIdx < 0) return null;

    const text = rows[bestIdx].text;
    const direct = audios.find((a) => text.includes(a.exact_text));
    if (direct) return joinUrl(API_BASE, direct.audio_file_url);

    const fallback = audios.find((a) => rows.some((r) => r.text.includes(a.exact_text)));
    return fallback ? joinUrl(API_BASE, fallback.audio_file_url) : null;
  };

  const jumpToChart = (timeSec: number) => {
    setSelectedTime(timeSec);
    chartCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashChart(true);
    const audio = findNearestAudioUrlAt(timeSec);
    if (audio) {
      setPlayingSrc(audio);
    }
  };

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
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-800" data-testid="text-session-name">
                {session.name}
              </h2>
              <p className="text-sm text-slate-500" data-testid="text-session-date">
                {session.date} - {session.time}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                restartDelay();
                refetch();
              }}
              className="border-slate-200"
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
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
          <Card
            className="p-6 shadow-sm border"
            style={{
              borderColor: domBorder,
              background: `linear-gradient(135deg, ${domBgStrong} 0%, ${domBgSoft} 40%, rgba(255,255,255,0.65) 100%)`,
              backdropFilter: "blur(2px)",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-800">
              Dominant Emotion
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: domDot }} />
              <p className="text-3xl font-semibold text-slate-900" data-testid="text-dominant">
                {dominantEmotionSummary.emotion}
              </p>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs bg-white/70 text-slate-900">
              <span className="font-medium">
                {(dominantEmotionSummary.value * 100).toFixed(1)}%
              </span>
              <span className="opacity-70">mean intensity</span>
            </div>
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
          {/* ======= Left: Charts ======= */}
          <Card
            ref={chartCardRef}
            className={`overflow-hidden border border-slate-200/60 bg-white/90 shadow-sm transition-shadow ${
              flashChart ? "ring-2 ring-violet-400 shadow-[0_0_0_6px_rgba(139,92,246,0.15)]" : ""
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 px-8 pt-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Emotion Trajectory</h3>
                <p className="text-sm text-slate-500">
                  Smoothed sentiment layers with dominant-emotion overlays
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["Dominant", "All", ...EMOTION_KEYS] as EmotionSelection[]).map((emotion) => (
                  <Button
                    key={emotion}
                    size="sm"
                    variant={selectedEmotion === emotion ? "default" : "outline"}
                    onClick={() => setSelectedEmotion(emotion)}
                    className={
                      selectedEmotion === emotion
                        ? "bg-slate-900"
                        : "border-slate-200 text-slate-600"
                    }
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
                  margin={{ top: 20, right: 48, left: 0, bottom: 24 }}
                  onMouseMove={(state) => {
                    const label = (state as any)?.activeLabel;
                    setSelectedTime(
                      typeof label === "number" ? label : label != null ? Number(label) : null
                    );
                  }}
                  onMouseLeave={() => setSelectedTime(null)}
                >
                  <defs>
                    <linearGradient id="dominantGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id={dominantStrokeGradient.id} x1="0" y1="0" x2="1" y2="0">
                      {dominantStrokeGradient.stops.map((stop, idx) => (
                        <stop key={`${stop.offset}-${idx}`} offset={stop.offset} stopColor={stop.color} />
                      ))}
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
                  <Tooltip content={<CustomTooltip getShiftLabelAt={getShiftLabelAt} />} />
                  <Legend verticalAlign="top" height={50} wrapperStyle={{ paddingBottom: 8 }} />

                  {selectedTime !== null && (
                    <ReferenceLine
                      x={selectedTime}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label={{ value: formatTimestamp(selectedTime), position: "top", fill: "#475569", fontSize: 12, dy: 10 }}
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

                  {/* Dominant area backdrop */}
                  {emotionData.length > 0 && (
                    <Area
                      type="monotone"
                      dataKey="dominantValue"
                      stroke="none"
                      fill="url(#dominantGradient)"
                      isAnimationActive={false}
                    />
                  )}

                  {/* Lines */}
                  {(() => {
                    const configs =
                      selectedEmotion === "All"
                        ? EMOTION_KEYS.map((emotion) => ({
                            key: emotion,
                            name: emotion,
                            stroke: getEmotionColor(emotion),
                            strokeWidth: 2,
                            strokeOpacity: 0.9,
                          }))
                        : selectedEmotion === "Dominant"
                        ? [
                            {
                              key: "dominantValue",
                              name: "Dominant",
                              stroke: `url(#${dominantStrokeGradient.id})`,
                              strokeWidth: 3,
                              strokeOpacity: 1,
                            },
                          ]
                        : [
                            {
                              key: selectedEmotion,
                              name: selectedEmotion,
                              stroke: getEmotionColor(selectedEmotion as EmotionType),
                              strokeWidth: 3,
                              strokeOpacity: 1,
                            },
                          ];
                    return configs.map((config) => (
                      <Line
                        key={config.key}
                        type="natural"
                        dataKey={config.key as any}
                        stroke={config.stroke as any}
                        strokeWidth={config.strokeWidth}
                        dot={false}
                        strokeOpacity={config.strokeOpacity}
                        activeDot={{ r: 4 }}
                        name={config.name}
                        isAnimationActive={false}
                      />
                    ));
                  })()}

                  {/* Critical shift moment nodes */}
                  {criticalShiftNodes.map((node, idx) => (
                    <ReferenceDot
                      key={`${node.time}-${idx}`}
                      x={node.x}
                      y={node.y}
                      r={6}
                      fill={getEmotionColor(node.emotion)}
                      stroke="#ffffff"
                      strokeWidth={2}
                      isFront
                      ifOverflow="extendDomain"
                      label={hoveredShift === idx ? {
                        value: node.label,
                        position: "top",
                        content: (props: any) => <CritBubbleLabel {...props} />,
                      } : undefined} onMouseEnter={() => setHoveredShift(idx)} onMouseLeave={() => setHoveredShift(null)}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="px-8 pb-6">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Dominant Emotion Timeline
                </h4>
                <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full">
                  {dominantSegments.map((segment, idx) => (
                    <div
                      key={`${segment.emotion}-${idx}`}
                      style={{
                        backgroundColor: getEmotionColor(segment.emotion),
                        flex: `${segment.end - segment.start} 0 auto`,
                        opacity: 0.7,
                      }}
                      title={`${segment.emotion} * ${formatTimestamp(segment.start)} - ${formatTimestamp(
                        segment.end
                      )}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {EMOTION_KEYS.map((emotion) => (
                    <span key={emotion} className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: getEmotionColor(emotion) }}
                      />
                      {emotion}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {criticalShiftNodes.length > 0 && (
              <div className="px-8 pb-6">
                <div className="rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-sm">
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Critical Moments
                  </h4>
                  <div className="mt-3 space-y-3">
                    {criticalShiftNodes.map((moment, idx) => {
                      const hex = getEmotionColor(moment.emotion);
                      const gradStrong = hexToRgba(hex, 0.14);
                      const gradSoft = hexToRgba(hex, 0.06);
                      const border = hexToRgba(hex, 0.25);
                      const chip = hexToRgba(hex, 0.16);
                      return (
                        <button
                          key={`${moment.time}-${idx}`}
                          onClick={() => jumpToChart(moment.time)}
                          className="w-full rounded-xl border px-4 py-3 text-left transition-all hover:brightness-[0.99] active:brightness-95"
                          style={{
                            borderColor: border,
                            background: `linear-gradient(135deg, ${gradStrong} 0%, ${gradSoft} 55%, rgba(255,255,255,0.85) 100%)`,
                          }}
                          data-testid={`critical-moment-${idx}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-900 flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hex }} />
                              {moment.label}
                            </span>
                            <span className="text-xs font-semibold text-slate-700">
                              {formatTimestamp(moment.time)}
                            </span>
                          </div>
                          <div
                            className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
                            style={{ backgroundColor: chip, color: "#0f172a" }}
                          >
                            Intensity {moment.intensity.toFixed(2)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {peopleBreakdown.length > 0 && (
              <div className="px-8 pb-8">
                <div className="rounded-2xl border border-slate-200 bg-white/85 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Audience Snapshot
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Latest dominant emotion per individual
                      </p>
                    </div>
                    {showGroupLowConfidence && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                        Low confidence across group (stats-based)
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {peopleBreakdown.map((person: PersonEmotionBreakdown) => {
                      const emotions = person.emotions ?? ({} as Record<EmotionType, number>);
                      const notes = Array.isArray(person.notes) ? person.notes : [];
                      const dominantEmotion = person.dominantEmotion ?? "Neutral";
                      const dominantValue =
                        typeof person.dominantValue === "number" ? person.dominantValue : 0;
                      const framesObserved =
                        typeof person.framesObserved === "number" ? person.framesObserved : 0;
                      const displayLabel = person.label ?? "Audience member";
                      const ranked = EMOTION_KEYS.map((emotion) => ({
                        emotion,
                        value: emotions[emotion] ?? 0,
                      }))
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 3);

                      const personId = person.id ?? displayLabel;
                      const isFlagged = flaggedIds.has(personId);

                      return (
                        <div
                          key={personId}
                          className={`rounded-xl border px-4 py-3 ${
                            isFlagged
                              ? "border-amber-300 bg-amber-50/70"
                              : "border-slate-200/80 bg-slate-50/70"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-800">
                              {displayLabel}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: getEmotionColor(dominantEmotion) }}
                              />
                              {dominantEmotion} {(dominantValue * 100).toFixed(0)}%
                            </span>
                          </div>

                          <div className="mt-2 space-y-1 text-xs text-slate-700">
                            {ranked.map(({ emotion, value }) => (
                              <div key={emotion} className="flex items-center justify-between">
                                <span>{emotion}</span>
                                <span>{(value * 100).toFixed(1)}%</span>
                              </div>
                            ))}

                            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400">
                              <span>Frames</span>
                              <span>{framesObserved}</span>
                            </div>
                          </div>

                          {notes.length > 0 && (
                            <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
                              {notes.map((note: string, idx: number) => (
                                <li key={`${personId}-note-${idx}`} className="flex items-start gap-1">
                                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  <span>{note}</span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {isFlagged && (
                            <div className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              Outlier (low confidence / high entropy)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ======= Right: Transcript / Highlights / Audio ======= */}
          <div className="space-y-6">
            {/* Summary status card */}


            {/* Completed view */}
            {summaryStatus === "completed" && rows.length > 0 && (
              <Card className="border border-slate-200/60 bg-white/90 p-0 shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Transcript & Highlights Powered by</div>
                  <div className="mt-2 flex items-center gap-2">
  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
    <img src={geminiLogo} alt="google" className="h-8 w-50 object-contain" />
  </span>
  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
    <img src={elevenlabsLogo} alt="elevenlabs" className="h-8 w-20 object-contain" />
  </span>
</div>
                </div>
                <div className="max-h-[520px] overflow-auto divide-y divide-slate-100">
                  {rows.map((row, idx) => {
                    const audioUrl = row.audio ? joinUrl(API_BASE, row.audio.audio_file_url) : null;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 px-4 py-3 ${
                          row.isHighlighted ? "bg-amber-50/60" : "bg-white"
                        }`}
                      >
                        <div className="shrink-0">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {row.timestamp}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800">{row.text}</p>
                          {row.isHighlighted && row.highlight && (
                            <p className="mt-1 text-[12px] text-amber-700">
                              <span className="font-medium">Why it matters:</span>{" "}
                              {row.highlight.reason_for_selection}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {audioUrl && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                setPlayingSrc((cur) => (cur === audioUrl ? null : audioUrl))
                              }
                              className="border-slate-200"
                              title={playingSrc === audioUrl ? "Pause clip" : "Play clip"}
                            >
                              {playingSrc === audioUrl ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* One shared audio element for simplicity */}
                <audio
                  src={playingSrc ?? undefined}
                  autoPlay
                  onEnded={() => setPlayingSrc(null)}
                  controls
                  className="w-full border-t border-slate-200 p-2"
                />
              </Card>
            )}

            {/* (AI Technical Assessment removed as requested) */}

            <Card className="border border-slate-200/60 bg-white/90 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Technical Highlights</h3>
              <div className="mt-4 space-y-4">
                {[
                  {
                    title: "Volatility Index",
                    value: stats.points ? (stats.volatility * 100).toFixed(1) + "%" : "--",
                    subtitle: "Avg. absolute change across emotions per second.",
                  },
                  {
                    title: "Dominant Swaps",
                    value: stats.transitions.toString(),
                    subtitle: "Distinct shifts in primary emotional channel.",
                  },
                  {
                    title: "Peak Intensity",
                    value: stats.points ? (stats.peak * 100).toFixed(1) + "%" : "--",
                    subtitle: "Highest dominant-emotion confidence observed.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl bg-slate-50/80 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {item.title}
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{item.value}</div>
                    <div className="text-xs text-slate-500">{item.subtitle}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* Bottom 3 per-emotion cards REMOVED as requested */}
      </main>
    </div>
  );
}
