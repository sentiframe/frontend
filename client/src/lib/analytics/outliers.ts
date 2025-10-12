import { useRef } from "react";

export type EmotionType =
  | "Happy" | "Sad" | "Angry" | "Fear" | "Surprise" | "Disgust" | "Neutral";
export const EMOTION_KEYS: EmotionType[] = [
  "Happy","Sad","Angry","Fear","Surprise","Disgust","Neutral"
];

export type PersonEmotionBreakdown = {
  id: string;
  label: string;
  dominantEmotion: EmotionType;
  dominantValue: number;              // 0..1
  emotions: Record<EmotionType, number>;
  framesObserved: number;
  notes: string[];
};

export type FaceFlag =
  | { id: string; kind: "low_conf_z"; z: number }
  | { id: string; kind: "high_entropy"; H: number };

export type OutlierResult = {
  flagged: Set<string>;
  flags: FaceFlag[];
  showGroupLowConfidence: boolean;
};

const EPS = 1e-6;

function shannonEntropyNormalized(p: Record<EmotionType, number>): number {
  let H = 0;
  for (const k of EMOTION_KEYS) {
    const v = Math.max(p[k] ?? 0, 0);
    if (v > 0) H += -v * Math.log(v);
  }
  const Hmax = Math.log(EMOTION_KEYS.length);
  return Hmax > 0 ? H / Hmax : 0; // 0..1
}

export function computeOutliersOnce(
  people: PersonEmotionBreakdown[],
  zThresh = -1.5,
  minPeople = 4,
  softFloor = 0.35,
  cvMin = 0.25,
  entropyHigh = 0.92
): OutlierResult {
  if (!people || people.length < minPeople) {
    return { flagged: new Set(), flags: [], showGroupLowConfidence: false };
  }

  const domVals = people.map((p) => p.dominantValue ?? 0);
  const mean = domVals.reduce((a, b) => a + b, 0) / domVals.length;
  const variance =
    domVals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, domVals.length - 1);
  const std = Math.sqrt(Math.max(variance, 0));
  const cv = std / Math.max(mean, EPS);

  const flags: FaceFlag[] = [];
  const flagged = new Set<string>();

  if (std > 0) {
    people.forEach((p) => {
      const z = (p.dominantValue - mean) / std;
      if (z <= zThresh) {
        flags.push({ id: p.id, kind: "low_conf_z", z });
        flagged.add(p.id);
      }
    });
  }

  // High entropy -> recognition drift / ambiguity
  people.forEach((p) => {
    const H = shannonEntropyNormalized(p.emotions as any);
    if (H >= entropyHigh && (p.dominantValue ?? 0) <= 0.42) {
      flags.push({ id: p.id, kind: "high_entropy", H });
      flagged.add(p.id);
    }
  });

  const softCount = domVals.filter((v) => v < softFloor).length;
  const showGroupLowConfidence = softCount / domVals.length >= 0.4 && cv >= cvMin;

  return { flagged, flags, showGroupLowConfidence };
}

/** Stateful: requires N consecutive frames to keep a face flagged (good for Live view) */
export function useOutlierFaces(options?: {
  consecutive?: number; // frames required to sustain the flag
  zThresh?: number;
  minPeople?: number;
  softFloor?: number;
  cvMin?: number;
  entropyHigh?: number;
}) {
  const {
    consecutive = 3,
    zThresh = -1.5,
    minPeople = 4,
    softFloor = 0.35,
    cvMin = 0.25,
    entropyHigh = 0.92,
  } = options ?? {};

  // id -> streak length
  const streak = useRef<Map<string, number>>(new Map());

  const evaluate = (people: PersonEmotionBreakdown[]): OutlierResult => {
    const one = computeOutliersOnce(people, zThresh, minPeople, softFloor, cvMin, entropyHigh);

    // update streaks
    const next = new Map<string, number>();
    one.flagged.forEach((id) => next.set(id, (streak.current.get(id) ?? 0) + 1));
    people.forEach((p) => { if (!next.has(p.id)) next.set(p.id, 0); });
    streak.current = next;

    const hardFlagged = new Set<string>();
    const hardFlags: FaceFlag[] = [];
    one.flags.forEach((f) => {
      if ((streak.current.get(f.id) ?? 0) >= consecutive) {
        hardFlagged.add(f.id);
        hardFlags.push(f);
      }
    });

    return {
      flagged: hardFlagged,
      flags: hardFlags,
      showGroupLowConfidence: one.showGroupLowConfidence,
    };
  };

  return { evaluate };
}
