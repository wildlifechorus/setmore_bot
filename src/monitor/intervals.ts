/**
 * Interval helpers for reschedule / freed-slot detection.
 * Computes portions of the previous booking window that are not covered
 * by the appointment after a reschedule.
 */

/** Contiguous time range in Unix milliseconds (same convention as appointments). */
export interface TimeSegment {
  start: number;
  end: number;
}

/**
 * Returns sub-intervals of [oldStart, oldEnd] that do not overlap
 * [newStart, newEnd]. If the two ranges do not overlap, the full old
 * range is treated as freed (the booking left that window entirely).
 *
 * @param oldStart - Previous booking start (ms)
 * @param oldEnd - Previous booking end (ms)
 * @param newStart - New booking start (ms)
 * @param newEnd - New booking end (ms)
 */
export function freedSegmentsAfterReschedule(
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
): TimeSegment[] {
  if (oldEnd <= oldStart) {
    return [];
  }

  const overlapStart = Math.max(oldStart, newStart);
  const overlapEnd = Math.min(oldEnd, newEnd);

  if (overlapStart >= overlapEnd) {
    return [{ start: oldStart, end: oldEnd }];
  }

  const segments: TimeSegment[] = [];

  if (oldStart < overlapStart) {
    segments.push({ start: oldStart, end: overlapStart });
  }

  if (overlapEnd < oldEnd) {
    segments.push({ start: overlapEnd, end: oldEnd });
  }

  return segments;
}

/**
 * Among freed segments, returns the longest by duration; ties favor
 * the earliest start time.
 */
export function getLongestFreedSegment(
  segments: TimeSegment[],
): TimeSegment | null {
  let best: TimeSegment | null = null;
  let bestLen = 0;

  for (const seg of segments) {
    const len = seg.end - seg.start;
    if (len <= 0) {
      continue;
    }
    if (len > bestLen || (len === bestLen && best && seg.start < best.start)) {
      best = seg;
      bestLen = len;
    }
  }

  return best;
}
