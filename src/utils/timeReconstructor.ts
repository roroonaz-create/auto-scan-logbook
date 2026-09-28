/**
 * Time Sequence Reconstruction & Interpolation Utility
 * 
 * Rules:
 * 1. Read OCR time first: Clearly read times are designated as ANCHORS (timeSource = "ocr").
 * 2. Format normalization: HH:mm (e.g. 7.30 -> 07:30, 19:05).
 * 3. Validation: 00:00 - 23:59. Invalid times (e.g. 19:75) are marked unreadable.
 * 4. Chronological interpolation:
 *    - Unreadable rows between anchor A and anchor B are distributed evenly in chronological order.
 *    - Strictly enforces: Anchor_A < Row_i < Row_j < Anchor_B.
 *    - Never crosses the next anchor.
 * 5. Extrapolation:
 *    - Forward or backward extrapolation if ends lack anchors, using prior interval.
 * 6. Source tracking:
 *    - rawScannedTime
 *    - finalTime
 *    - timeSource: "ocr" | "estimated" | "manual"
 */

export type TimeSource = "ocr" | "estimated" | "manual";

export interface ReconstructedTime {
  rawScannedTime: string | null;
  finalTime: string;
  timeSource: TimeSource;
}

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const s = String(timeStr).trim().replace(".", ":");
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function formatMinutesToTime(minutes: number): string {
  let m = minutes % (24 * 60);
  if (m < 0) m += 24 * 60;
  const hours = Math.floor(m / 60);
  const mins = Math.floor(m % 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function reconstructTimeSequence(
  rawTimes: (string | null | undefined)[]
): ReconstructedTime[] {
  const n = rawTimes.length;
  if (n === 0) return [];

  const result: ReconstructedTime[] = rawTimes.map((rt) => {
    const raw = (rt || "").trim();
    const mins = parseTimeToMinutes(raw);
    if (mins !== null) {
      return {
        rawScannedTime: raw,
        finalTime: formatMinutesToTime(mins),
        timeSource: "ocr" as TimeSource,
      };
    }
    return {
      rawScannedTime: raw && raw !== "[TIDAK_TERBACA]" ? raw : null,
      finalTime: "",
      timeSource: "estimated" as TimeSource,
    };
  });

  // Find all anchor indices where timeSource === "ocr"
  const anchorIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (result[i].timeSource === "ocr") {
      anchorIndices.push(i);
    }
  }

  // If no valid time anchors found at all across the entire column, leave as is
  if (anchorIndices.length === 0) {
    return result;
  }

  // 1. Interpolate between consecutive anchors
  for (let a = 0; a < anchorIndices.length - 1; a++) {
    const startIdx = anchorIndices[a];
    const endIdx = anchorIndices[a + 1];
    const unreadCount = endIdx - startIdx - 1;

    if (unreadCount > 0) {
      const startMins = parseTimeToMinutes(result[startIdx].finalTime)!;
      const endMins = parseTimeToMinutes(result[endIdx].finalTime)!;

      let diff = endMins - startMins;
      if (diff < 0) {
        // Night shift crossing midnight (e.g. 23:30 to 00:30)
        diff += 24 * 60;
      }

      const step = diff / (unreadCount + 1);

      for (let k = 1; k <= unreadCount; k++) {
        const curIdx = startIdx + k;
        let curMins = Math.round(startMins + k * step);
        if (curMins >= 24 * 60) curMins -= 24 * 60;
        result[curIdx] = {
          rawScannedTime: result[curIdx].rawScannedTime,
          finalTime: formatMinutesToTime(curMins),
          timeSource: "estimated",
        };
      }
    }
  }

  // 2. Extrapolate backward before first anchor (if first rows are unreadable)
  const firstAnchor = anchorIndices[0];
  if (firstAnchor > 0) {
    let step = 15; // default 15 min interval
    if (anchorIndices.length >= 2) {
      const a0 = parseTimeToMinutes(result[anchorIndices[0]].finalTime)!;
      const a1 = parseTimeToMinutes(result[anchorIndices[1]].finalTime)!;
      let diff = a1 - a0;
      if (diff < 0) diff += 24 * 60;
      const avgStep = Math.round(diff / (anchorIndices[1] - anchorIndices[0]));
      if (avgStep > 0 && avgStep <= 60) step = avgStep;
    }

    const anchorMins = parseTimeToMinutes(result[firstAnchor].finalTime)!;
    for (let i = firstAnchor - 1; i >= 0; i--) {
      const distance = firstAnchor - i;
      let mins = anchorMins - distance * step;
      if (mins < 0) mins += 24 * 60;
      result[i] = {
        rawScannedTime: result[i].rawScannedTime,
        finalTime: formatMinutesToTime(mins),
        timeSource: "estimated",
      };
    }
  }

  // 3. Extrapolate forward after last anchor (if trailing rows are unreadable)
  const lastAnchor = anchorIndices[anchorIndices.length - 1];
  if (lastAnchor < n - 1) {
    let step = 15; // default 15 min interval
    if (anchorIndices.length >= 2) {
      const prevAnchor = anchorIndices[anchorIndices.length - 2];
      const aPrev = parseTimeToMinutes(result[prevAnchor].finalTime)!;
      const aLast = parseTimeToMinutes(result[lastAnchor].finalTime)!;
      let diff = aLast - aPrev;
      if (diff < 0) diff += 24 * 60;
      const avgStep = Math.round(diff / (lastAnchor - prevAnchor));
      if (avgStep > 0 && avgStep <= 60) step = avgStep;
    }

    const anchorMins = parseTimeToMinutes(result[lastAnchor].finalTime)!;
    for (let i = lastAnchor + 1; i < n; i++) {
      const distance = i - lastAnchor;
      let mins = anchorMins + distance * step;
      if (mins >= 24 * 60) mins -= 24 * 60;
      result[i] = {
        rawScannedTime: result[i].rawScannedTime,
        finalTime: formatMinutesToTime(mins),
        timeSource: "estimated",
      };
    }
  }

  return result;
}

export function reconstructRowTimes<T extends { jam_in?: string; jam_out?: string }>(
  rows: T[]
): {
  rows: T[];
  timeMetadata: {
    jam_in: ReconstructedTime[];
    jam_out: ReconstructedTime[];
  };
} {
  if (!rows || rows.length === 0) {
    return {
      rows: [],
      timeMetadata: { jam_in: [], jam_out: [] },
    };
  }

  const rawJamIn = rows.map((r) => r.jam_in);
  const rawJamOut = rows.map((r) => r.jam_out);

  const recJamIn = reconstructTimeSequence(rawJamIn);
  const recJamOut = reconstructTimeSequence(rawJamOut);

  const updatedRows = rows.map((row, idx) => ({
    ...row,
    jam_in: recJamIn[idx].finalTime || row.jam_in || "",
    jam_out: recJamOut[idx].finalTime || row.jam_out || "",
  }));

  return {
    rows: updatedRows,
    timeMetadata: {
      jam_in: recJamIn,
      jam_out: recJamOut,
    },
  };
}
