import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { startSession as startRemoteSession, stopSession as stopRemoteSession, frameToEmotionPoint } from "@/lib/sessions";
import { getAllFrames, getFrameBatch } from "@/lib/firebase";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine as RechartsReferenceLine,
} from "recharts";
import type { Props as XAxisProps } from "recharts/types/cartesian/XAxis";
import type { Props as YAxisProps } from "recharts/types/cartesian/YAxis";
import type { Props as ReferenceLineProps } from "recharts/types/cartesian/ReferenceLine";
import type { TooltipProps } from "recharts/types/component/Tooltip";
import type { EmotionDataPoint, CriticalMomentType, Session } from "@shared/schema";

interface LiveSessionProps {
  session: Session;
  onEndSession: (emotionData: EmotionDataPoint[], criticalMoments: CriticalMomentType[]) => void;
  onBack?: () => void;
}

type EmotionType = "All" | "Happy" | "Sad" | "Angry" | "Fear" | "Surprise" | "Disgust" | "Neutral";
type EmotionKey = Exclude<EmotionType, "All">;

const EMOTION_KEYS: EmotionKey[] = ["Happy", "Sad", "Angry", "Fear", "Surprise", "Disgust", "Neutral"];

const EMOTION_COLORS: Record<EmotionKey, string> = {
  Happy: "#F59E0B",
  Sad: "#2563EB",
  Angry: "#EF4444",
  Fear: "#8B5CF6",
  Surprise: "#FB923C",
  Disgust: "#22C55E",
  Neutral: "#6B7280",
};

// Keep Recharts line type simple; data will be pre-smoothed with quadratic regression
const LINE_TYPE: "linear" | "monotone" | "step" | "stepAfter" | "stepBefore" = "linear";

type TranscriptSegment = { time: number; text: string };
type LocalMoment = CriticalMomentType & { type?: "spike" | "jump" | "switch" };

const REVEAL_CSS = `
@keyframes wipeReveal {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0% 0 0); }
}
.wipe-reveal { display:inline-block; animation:wipeReveal 800ms ease forwards; }
`;

const PulsingDot = ({ cx, cy, fill }: { cx: number; cy: number; fill: string }) => (
  <g>
    <circle cx={cx} cy={cy} r={4} fill={fill} className="animate-pulse" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
    <circle cx={cx} cy={cy} r={8} fill={fill} opacity={0.3} className="animate-ping" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
  </g>
);

const isEmotionKey = (emotion: EmotionType): emotion is EmotionKey => emotion !== "All";

const XAxis = RechartsXAxis as ComponentType<XAxisProps>;
const YAxis = RechartsYAxis as ComponentType<YAxisProps>;
const Tooltip = RechartsTooltip as ComponentType<TooltipProps<number, string>>;
const ReferenceLine = RechartsReferenceLine as ComponentType<ReferenceLineProps>;

function getDominantKey(point: EmotionDataPoint): EmotionKey {
  let best: EmotionKey = "Neutral";
  let val = -Infinity;
  for (const k of EMOTION_KEYS) {
    const v = point[k] ?? 0;
    if (v > val) {
      val = v;
      best = k;
    }
  }
  return best;
}

function detectCriticalMoments(
  data: EmotionDataPoint[],
  prevMoments: LocalMoment[] = [],
  opts = { spike: 0.6, jump: 0.22 }
): LocalMoment[] {
  const moments: LocalMoment[] = [...prevMoments];
  if (data.length < 3) return moments;
  const startIdx = Math.max(1, data.length - 120);
  for (let i = startIdx; i < data.length - 1; i++) {
    const prev = data[i - 1], curr = data[i], next = data[i + 1];
    for (const emotion of EMOTION_KEYS) {
      const p = prev[emotion] ?? 0;
      const c = curr[emotion] ?? 0;
      const n = next[emotion] ?? 0;
      if (c > p && c > n && c >= opts.spike) {
        moments.push({ time: curr.time, emotion, intensity: c, description: `${emotion} spike`, type: "spike" } as LocalMoment);
      }
      const delta = Math.abs(c - p);
      if (delta >= opts.jump) {
        moments.push({ time: curr.time, emotion, intensity: c, description: `${emotion} jump (Δ=${delta.toFixed(2)})`, type: "jump" } as LocalMoment);
      }
    }
    const dPrev = getDominantKey(prev);
    const dCurr = getDominantKey(curr);
    if (dPrev !== dCurr) {
      moments.push({ time: curr.time, emotion: dCurr, intensity: curr[dCurr] ?? 0, description: `Dominant switched ${dPrev} → ${dCurr}`, type: "switch" } as LocalMoment);
    }
  }
  const seen = new Set<string>();
  return moments.filter((m) => {
    const key = `${m.time}|${m.type ?? "u"}|${m.emotion}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Normalize Firestore transcripts (array OR { "0": {...}, "1": {...} }) */
function extractTranscriptList(maybeList: any): Array<{ start?: number; end?: number; text?: string }> {
  if (!maybeList) return [];
  if (Array.isArray(maybeList)) return maybeList;
  if (typeof maybeList === "object") {
    const keys = Object.keys(maybeList).sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => maybeList[k]);
  }
  return [];
}

/** ---- Quadratic regression smoothing helpers ----
 * Smooths y vs. x with a sliding quadratic fit (window size should be odd).
 */
function quadraticSmooth(points: { x: number; y: number }[], window = 9): { x: number; y: number }[] {
  if (points.length < 3 || window <= 2) return points;
  const nPts = points.length;
  const half = Math.floor(window / 2);
  const out: { x: number; y: number }[] = new Array(nPts);
  for (let i = 0; i < nPts; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(nPts - 1, i + half);
    let n = 0;
    let Sx = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0;
    let Sy = 0, Sxy = 0, Sx2y = 0;
    for (let k = start; k <= end; k++) {
      const x = points[k]!.x;
      const y = points[k]!.y ?? 0;
      n += 1;
      const x2 = x * x;
      const x3 = x2 * x;
      const x4 = x3 * x;
      Sx += x; Sx2 += x2; Sx3 += x3; Sx4 += x4;
      Sy += y; Sxy += x * y; Sx2y += x2 * y;
    }
    const denom =
      n * (Sx2 * Sx4 - Sx3 * Sx3) -
      Sx * (Sx * Sx4 - Sx2 * Sx3) +
      Sx2 * (Sx * Sx3 - Sx2 * Sx2);
    const x0 = points[i]!.x;
    if (denom === 0) {
      out[i] = { x: x0, y: points[i]!.y ?? 0 };
      continue;
    }
    const a =
      (Sy * (Sx2 * Sx4 - Sx3 * Sx3) -
        Sx * (Sxy * Sx4 - Sx3 * Sx2y) +
        Sx2 * (Sxy * Sx3 - Sx2 * Sx2y)) / denom;
    const b =
      (n * (Sxy * Sx4 - Sx3 * Sx2y) -
        Sy * (Sx * Sx4 - Sx2 * Sx3) +
        Sx2 * (Sx * Sx2y - Sx2 * Sxy)) / denom;
    const c =
      (n * (Sx2 * Sx2y - Sx3 * Sxy) -
        Sx * (Sx * Sx2y - Sx2 * Sxy) +
        Sy * (Sx * Sx3 - Sx2 * Sx2)) / denom;
    out[i] = { x: x0, y: a + b * x0 + c * x0 * x0 };
  }
  return out;
}

/** Smooth full emotion dataset once per render for all series */
function buildSmoothedChartData(raw: EmotionDataPoint[], window = 9) {
  if (!raw.length) {
    return [{ time: 0, Happy: 0, Sad: 0, Angry: 0, Fear: 0, Surprise: 0, Disgust: 0, Neutral: 0 }];
  }
  const n = raw.length;
  // Prepare per-emotion smoothed arrays (compute once)
  const smoothedByKey: Record<EmotionKey, number[]> = {} as any;
  for (const key of EMOTION_KEYS) {
    const pts = raw.map((p) => ({ x: p.time, y: p[key] ?? 0 }));
    const smooth = quadraticSmooth(pts, window);
    smoothedByKey[key] = smooth.map((p) => {
      if (Number.isFinite(p.y)) {
        // Clamp to [0,1] in case of slight overshoot
        return Math.max(0, Math.min(1, p.y));
      }
      return p.y ?? 0;
    });
  }
  // Stitch rows back together
  const rows: any[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row: any = { time: raw[i]!.time };
    for (const key of EMOTION_KEYS) {
      row[key] = smoothedByKey[key]![i];
    }
    rows[i] = row;
  }
  return rows;
}

const LiveTranscript: React.FC<{ segments: TranscriptSegment[] }> = ({ segments }) => (
  <div className="space-y-2">
    {segments.map((seg, i) => (
      <div key={`${seg.time}-${i}`} className="text-sm text-slate-700 leading-6">
        <span className="text-[11px] mr-2 text-slate-400">{seg.time.toFixed(2)}s</span>
        <span className="wipe-reveal">{seg.text}</span>
      </div>
    ))}
  </div>
);

export function LiveSession({ session, onEndSession, onBack }: LiveSessionProps) {
  const sessionFrames: EmotionDataPoint[] = session.emotionData ?? [];
  const [emotionData, setEmotionData] = useState<EmotionDataPoint[]>(sessionFrames);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>("All");
  const [isRecording, setIsRecording] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);

  const [allCriticalMomentsLive, setAllCriticalMomentsLive] = useState<LocalMoment[]>(
    (session.criticalMoments as LocalMoment[]) || [],
  );
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);

  const initialLastPoint = sessionFrames.length ? sessionFrames[sessionFrames.length - 1]! : null;
  const [currentFrame, setCurrentFrame] = useState(initialLastPoint ? initialLastPoint.time : 0);

  const latestFrameRef = useRef<number | null>(initialLastPoint ? initialLastPoint.time : null);
  const emotionDataRef = useRef<EmotionDataPoint[]>(sessionFrames);
  const pollInFlightRef = useRef(false);
  const overlayTimeoutRef = useRef<number | null>(null);

  const createDotRenderer = useCallback(
    (color: string) =>
      (props: any) => {
        const index = typeof props?.index === "number" ? props.index : -1;
        if (isRecording && index === emotionDataRef.current.length - 1) {
          return <PulsingDot {...props} fill={color} />;
        }
        const cx = typeof props?.cx === "number" ? props.cx : 0;
        const cy = typeof props?.cy === "number" ? props.cy : 0;
        return <circle cx={cx} cy={cy} r={0} fill="transparent" />;
      },
    [isRecording],
  );

  // DEBUG button: dump all transcripts for the video to console
  const dumpAllTranscriptsToConsole = useCallback(async () => {
    const videoId = session.videoId || session.id;
    try {
      const frames: any[] = await getAllFrames(videoId);
      console.groupCollapsed(`[TranscriptDump] /videos/${videoId}/frames  (frames: ${frames.length})`);
      let totalSegs = 0;
      for (const f of frames) {
        const frameId =
          f?.id || f?.frameId ||
          (typeof f?.frame_number === "number" ? `frame_${f.frame_number}` :
           typeof f?.time === "number" ? `frame_${Math.round(f.time)}` : "unknown_frame");

        const list = extractTranscriptList(f?.transcripts);
        if (!list.length) continue;

        totalSegs += list.length;
        console.groupCollapsed(`frames/${frameId} — transcripts (${list.length})`);
        console.log("raw transcripts object:", f?.transcripts);
        console.table(
          list.map((s: any, i: number) => ({
            idx: i,
            start: typeof s?.start === "number" ? s.start : Number(s?.start ?? NaN),
            end:   typeof s?.end   === "number" ? s.end   : Number(s?.end   ?? NaN),
            text:  String(s?.text ?? "").trim(),
          }))
        );
        if (list[0]) {
          console.log("transcripts[0]:", { start: list[0].start, end: list[0].end, text: list[0].text });
        }
        console.groupEnd();
      }
      if (!totalSegs) console.info("[TranscriptDump] No transcript segments found.");
      console.groupEnd();
    } catch (e) {
      console.error("[TranscriptDump] Failed to read frames:", e);
    }
  }, [session.id, session.videoId]);

  // Seed from session (including transcripts if present)
  useEffect(() => {
    const frames: EmotionDataPoint[] = session.emotionData ?? [];
    setEmotionData(frames);
    emotionDataRef.current = frames;

    const seeded = detectCriticalMoments(frames, (session.criticalMoments as LocalMoment[]) || []);
    setAllCriticalMomentsLive(seeded);

    const seededList = extractTranscriptList((session as any).transcripts);
    const seededTranscript: TranscriptSegment[] = seededList.map((t: any) => ({
      time: typeof t?.end === "number" ? t.end : (typeof t?.start === "number" ? t.start : 0),
      text: String(t?.text ?? ""),
    }));
    setTranscript(seededTranscript);

    if (frames.length > 0) {
      const last: any = frames[frames.length - 1];
      const lastTime = typeof last?.time === "number" ? (last.time as number) : 0;
      setCurrentFrame(lastTime);
      latestFrameRef.current = lastTime;
      setHasStarted(true);
    } else {
      latestFrameRef.current = null;
    }
  }, [session]);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
      setShowCompletionOverlay(false);
    };
  }, []);

  useEffect(() => {
    if (emotionData.length > 0) {
      const last: any = emotionData[emotionData.length - 1];
      if (typeof last?.time === "number") {
        latestFrameRef.current = last.time;
      }
    }
  }, [emotionData]);

  // Poll live frames; log and append transcripts (map or array)
  useEffect(() => {
    if (!isRecording) return;
    let cancelled = false;

    const fetchBatch = async () => {
      if (cancelled || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const videoId = session.videoId || session.id;
        const lastFrame = latestFrameRef.current;
        const batch: any[] = await getFrameBatch(videoId, {
          startAfter: typeof lastFrame === "number" ? lastFrame : undefined,
          limit: 120,
        });

        if (cancelled || !batch.length) return;

        const baseIndex = emotionDataRef.current.length;
        const nextPoints = batch.map((frame, idx) => frameToEmotionPoint(frame, baseIndex + idx));
        if (!nextPoints.length) return;

        const nextLatestPoint = nextPoints[nextPoints.length - 1];
        const latestTime = nextLatestPoint.time;

        // --- transcript logging + normalization ---
        console.groupCollapsed(`[TranscriptBatch] /videos/${videoId}/frames  (batch: ${batch.length})`);
        let segs = 0;
        const newSegments: TranscriptSegment[] = [];
        for (const f of batch) {
          const frameId =
            f?.id || f?.frameId ||
            (typeof f?.frame_number === "number" ? `frame_${f.frame_number}` :
             typeof f?.time === "number" ? `frame_${Math.round(f.time)}` : "unknown_frame");
          const list = extractTranscriptList(f?.transcripts);
          if (!list.length) continue;

          segs += list.length;
          console.groupCollapsed(`frames/${frameId} — transcripts (${list.length})`);
          console.log("raw transcripts object:", f?.transcripts);
          console.table(
            list.map((s: any, i: number) => ({
              idx: i,
              start: s?.start,
              end: s?.end,
              text: s?.text,
            }))
          );
          if (list[0]) console.log("transcripts[0]:", list[0]);
          console.groupEnd();

          for (const seg of list) {
            const text = String(seg?.text ?? "");
            if (!text.trim()) continue;
            const t =
              typeof seg?.end === "number" ? seg.end :
              typeof seg?.start === "number" ? seg.start :
              typeof f?.time === "number" ? f.time : 0;
            newSegments.push({ time: t, text });
          }
        }
        if (!segs) console.info("[TranscriptBatch] No transcripts found in this batch.");
        console.groupEnd();

        if (newSegments.length) newSegments.sort((a, b) => a.time - b.time);

        setEmotionData((prev) => {
          const merged = [...prev, ...nextPoints];
          emotionDataRef.current = merged;
          return merged;
        });

        if (newSegments.length) {
          setTranscript((prev) => {
            const seen = new Set(prev.map((s) => `${s.time}|${s.text}`));
            const filtered = newSegments.filter((s) => {
              const key = `${s.time}|${s.text}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            if (filtered.length) {
              console.groupCollapsed(`[TranscriptUIAppend] appending ${filtered.length} segment(s)`);
              console.table(filtered);
              console.groupEnd();
            }
            return filtered.length ? [...prev, ...filtered] : prev;
          });
        }

        setAllCriticalMomentsLive((prev) => detectCriticalMoments(emotionDataRef.current, prev));
        latestFrameRef.current = latestTime;
        setCurrentFrame(latestTime);
        setHasStarted(true);

        queryClient.setQueryData<Session[]>(["sessions"], (existing) => {
          if (!existing) return existing;
          return existing.map((item) =>
            item.id === session.id ? { ...item, duration: latestTime } : item,
          );
        });
      } catch (error) {
        console.error("Failed to fetch live frames", error);
      } finally {
        pollInFlightRef.current = false;
      }
    };

    fetchBatch();
    const interval = setInterval(fetchBatch, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isRecording, session.id, session.videoId]);

  const xAxisDomain = useMemo<[number, number]>(() => {
    const maxTime = Math.max(currentFrame, 10);
    if (maxTime <= 10) return [0, 10];
    if (maxTime <= 30) return [0, 30];
    if (maxTime <= 60) return [0, 60];
    return [Math.max(0, maxTime - 60), maxTime + 10];
  }, [currentFrame]);

  const handleStartRecording = useCallback(async () => {
    if (isRecording || isStarting || isEnding) return;
    setIsStarting(true);
    try {
      await startRemoteSession(session.id);
      setHasStarted(true);
      setIsRecording(true);
    } catch {
      alert("Unable to start recording. Please try again.");
    } finally {
      setIsStarting(false);
    }
  }, [isRecording, isStarting, isEnding, session.id]);

  // Per request: End -> refresh the page
  const handleEndSession = useCallback(async () => {
    if (isEnding) return;
    setIsEnding(true);
    setIsRecording(false);
    try {
      await stopRemoteSession(session.id);
    } catch (error) {
      console.error("Failed to stop session:", error);
    }
    setShowCompletionOverlay(true);
    overlayTimeoutRef.current = window.setTimeout(() => {
      window.location.reload();
    }, 250);
  }, [isEnding, session.id]);

  // >>> Quadratic regression–smoothed chart data <<<
  const chartData = useMemo(() => buildSmoothedChartData(emotionData,  nineAdaptive(emotionData.length)), [emotionData]);

  // small helper to adapt window a bit as data grows (odd numbers only)
  function nineAdaptive(n: number) {
    if (n < 15) return 5;
    if (n < 40) return 7;
    if (n < 100) return 9;
    if (n < 200) return 11;
    return 13;
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-slate-600 hover:bg-slate-100">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <h2 style={{ fontSize: "18px", fontWeight: 600 }}>{session.name}</h2>
            {isRecording && (
              <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600" data-testid="recording-indicator">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
                Recording
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={dumpAllTranscriptsToConsole} title="Log all transcripts from /videos/<VIDEO>/frames">
              Log Transcript to Console
            </Button>
            {!hasStarted ? (
              <Button
                onClick={handleStartRecording}
                data-testid="button-start-recording"
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                disabled={isStarting || isEnding}
              >
                {isStarting && <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>}
                Start Recording
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleEndSession}
                data-testid="button-end-session"
                className="border-red-200 text-red-600 hover:bg-red-50 disabled:pointer-events-none disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700"
                disabled={isEnding}
              >
                {isEnding ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                    Ending & Refreshing...
                  </span>
                ) : (
                  "End & Generate Report"
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="px-8 py-12 max-w-7xl mx-auto">
        <style>{REVEAL_CSS}</style>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Chart & Moments */}
          <div className="lg:col-span-8 space-y-8">
            <Card className="p-8" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Emotion Telemetry</h3>
                  <p className="text-sm text-muted-foreground mt-1">Live confidence scores update every second during recording.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(["All", ...EMOTION_KEYS] as EmotionType[]).map((emotion) => (
                    <Button key={emotion} size="sm" variant={selectedEmotion === emotion ? "default" : "outline"} onClick={() => setSelectedEmotion(emotion)}>
                      {emotion}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="relative h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 40, left: 0, bottom: 0 }}
                    onMouseMove={(state) => {
                      const label = (state as any)?.activeLabel;
                      setSelectedTime(typeof label === "number" ? label : label != null ? Number(label) : null);
                    }}
                    onMouseLeave={() => setSelectedTime(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" domain={[chartData[0]?.time ?? 0, chartData[chartData.length - 1]?.time ?? 10]} tickFormatter={(value) => `${value}s`} />
                    <YAxis domain={[0, 1]} tickFormatter={(value) => (value as number).toFixed(1)} />
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
                            type={LINE_TYPE}
                            connectNulls
                            isAnimationActive={false}
                            dataKey={emotion}
                            stroke={EMOTION_COLORS[emotion]}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            activeDot={{ r: 3, stroke: EMOTION_COLORS[emotion], strokeWidth: 2, fill: "#fff" }}
                            dot={false}
                          />
                        ))
                      : isEmotionKey(selectedEmotion) && (
                          <Line
                            key={`selected-${selectedEmotion}`}
                            type={LINE_TYPE}
                            connectNulls
                            isAnimationActive={false}
                            dataKey={selectedEmotion}
                            stroke={EMOTION_COLORS[selectedEmotion]}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            activeDot={{ r: 3, stroke: EMOTION_COLORS[selectedEmotion], strokeWidth: 2, fill: "#fff" }}
                            dot={false}
                          />
                        )}
                  </LineChart>
                </ResponsiveContainer>

                {!emotionData.length && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full border border-dashed border-slate-300 bg-white/80 px-4 py-2 text-xs text-slate-500 shadow-sm">
                      Recording has not started yet.
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {selectedEmotion === "All"
                  ? EMOTION_KEYS.map((emotion) => (
                      <span key={emotion} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[emotion] }}></span>
                        {emotion}
                      </span>
                    ))
                  : isEmotionKey(selectedEmotion) && (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: EMOTION_COLORS[selectedEmotion] }}></span>
                        Current confidence: {emotionData.length > 0 ? emotionData[emotionData.length - 1]?.[selectedEmotion].toFixed(3) : "N/A"}
                      </span>
                    )}
              </div>
            </Card>

            {allCriticalMomentsLive.length > 0 && (
              <Card className="p-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
                <h3 className="mb-4" style={{ fontSize: "18px", fontWeight: 600 }}>Critical Moments (Live)</h3>
                <div className="space-y-3 max-h-[320px] overflow-auto pr-1">
                  {allCriticalMomentsLive.map((moment, idx) => (
                    <button
                      key={`${moment.time}-${idx}`}
                      onClick={() => setSelectedTime(moment.time)}
                      className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-all hover:bg-gray-50"
                      data-testid={`critical-moment-${idx}`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS[(moment.emotion as EmotionKey) ?? "Neutral"] ?? "#94a3b8" }} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{moment.description ?? `${moment.emotion} event`} • {moment.time.toFixed(2)}s</p>
                        <p className="text-xs text-muted-foreground">{moment.emotion} • Intensity {(moment.intensity ?? 0).toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right: Live Transcript */}
          <div className="lg:col-span-4">
            <Card className="p-6 lg:sticky lg:top-6" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
              <div className="mb-2 flex items-center justify-between">
                <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Live Transcript</h3>
                <span className="text-xs text-slate-400">{transcript.length} line{transcript.length === 1 ? "" : "s"}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Pulled from <code>transcripts</code> (map or array) under each frame. Use the header button to log to console.
              </p>
              <div className="max-h-[520px] overflow-auto pr-1">
                <LiveTranscript segments={transcript} />
              </div>
            </Card>
          </div>
        </div>
      </main>

      {showCompletionOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 text-white transition-opacity duration-500 ease-out">
          <div className="flex items-center gap-3 text-sm uppercase tracking-[0.35em] text-emerald-100/80">
            <span className="h-2 w-2 rounded-full bg-emerald-100 animate-ping"></span>
            REPORT MODE
          </div>
          <h3 className="mt-6 text-3xl font-semibold tracking-tight">Finalizing Insights</h3>
          <p className="mt-3 max-w-md text-center text-base text-emerald-50/90">Ending the session and refreshing…</p>
          <div className="mt-10 flex items-center justify-center">
            <div className="h-20 w-20 rounded-full border-4 border-emerald-300/40 border-t-white animate-spin"></div>
          </div>
          <p className="mt-10 text-xs uppercase tracking-[0.4em] text-emerald-100/70">Rendering Emotional Narrative</p>
        </div>
      )}
    </div>
  );
}
