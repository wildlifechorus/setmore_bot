/**
 * Tests for freed-interval helpers used by the reschedule detector.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  freedSegmentsAfterReschedule,
  getLongestFreedSegment,
} from './intervals';

const MINUTE_MS = 60 * 1000;

test('slide earlier with same duration: only tail freed, under 90 minutes', () => {
  // Same pattern as 14:30–16:00 moved to 14:00–15:30 (90 min each).
  const oldStart = 100;
  const oldEnd = oldStart + 90 * MINUTE_MS;
  const newStart = oldStart - 30 * MINUTE_MS;
  const newEnd = newStart + 90 * MINUTE_MS;

  const segments = freedSegmentsAfterReschedule(
    oldStart,
    oldEnd,
    newStart,
    newEnd,
  );
  const longest = getLongestFreedSegment(segments);

  assert.equal(segments.length, 1);
  assert.deepEqual(longest, {
    start: oldEnd - 30 * MINUTE_MS,
    end: oldEnd,
  });
  assert.ok(
    longest!.end - longest!.start < 90 * MINUTE_MS,
    '30-minute tail must not meet notify threshold',
  );
});

test('partial overlap: contiguous freed tail of 100 minutes', () => {
  const oldStart = 0;
  const oldEnd = 120 * MINUTE_MS;
  const newStart = 0;
  const newEnd = 20 * MINUTE_MS;

  const segments = freedSegmentsAfterReschedule(
    oldStart,
    oldEnd,
    newStart,
    newEnd,
  );
  const longest = getLongestFreedSegment(segments);

  assert.deepEqual(longest, {
    start: 20 * MINUTE_MS,
    end: 120 * MINUTE_MS,
  });
  assert.equal(longest!.end - longest!.start, 100 * MINUTE_MS);
});

test('no overlap: entire previous slot counts as freed', () => {
  const oldStart = 1_000_000;
  const oldEnd = oldStart + 95 * MINUTE_MS;
  const newStart = oldEnd + 10 * MINUTE_MS;
  const newEnd = newStart + 30 * MINUTE_MS;

  const segments = freedSegmentsAfterReschedule(
    oldStart,
    oldEnd,
    newStart,
    newEnd,
  );

  assert.deepEqual(segments, [{ start: oldStart, end: oldEnd }]);
  assert.deepEqual(getLongestFreedSegment(segments), {
    start: oldStart,
    end: oldEnd,
  });
});

test('two fragments: longest contiguous segment wins', () => {
  const segments = freedSegmentsAfterReschedule(10, 100, 40, 60);
  const longest = getLongestFreedSegment(segments);

  assert.deepEqual(segments, [
    { start: 10, end: 40 },
    { start: 60, end: 100 },
  ]);
  assert.deepEqual(longest, { start: 60, end: 100 });
});

test('new booking fully covers old slot: no freed segments', () => {
  const segments = freedSegmentsAfterReschedule(100, 200, 50, 250);
  assert.deepEqual(segments, []);
  assert.equal(getLongestFreedSegment(segments), null);
});
