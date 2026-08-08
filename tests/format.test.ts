import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, compactCount, dayLabel, formatBytes, readingLabel } from '../src/format.js';

/** Local midnight for a given day, so the tests do not depend on the timezone. */
function at(year: number, month: number, day: number, hour = 12): number {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

describe('dayLabel', () => {
  test('compares calendar days, not elapsed hours', () => {
    // Saved at 23:50, read at 00:10 the next day: 20 minutes apart, but a
    // different day, and "Today" would read as wrong to anyone who has slept.
    const saved = at(2026, 3, 10, 23) + 50 * 60_000;
    const now = at(2026, 3, 11, 0) + 10 * 60_000;
    assert.equal(dayLabel(saved, now), 'Yesterday');
  });

  test('same day is Today even hours apart', () => {
    assert.equal(dayLabel(at(2026, 3, 10, 1), at(2026, 3, 10, 23)), 'Today');
  });

  test('counts days, then weeks, then months', () => {
    assert.equal(dayLabel(at(2026, 3, 7), at(2026, 3, 10)), '3 days ago');
    assert.equal(dayLabel(at(2026, 3, 1), at(2026, 3, 10)), 'Last week');
    assert.equal(dayLabel(at(2026, 1, 5), at(2026, 3, 10)), '2 months ago');
  });

  test('a future timestamp does not produce a negative label', () => {
    assert.equal(dayLabel(at(2026, 3, 12), at(2026, 3, 10)), 'Today');
  });
});

describe('bucketOf', () => {
  test('groups into the headings the list renders', () => {
    const now = at(2026, 3, 20);
    assert.equal(bucketOf(at(2026, 3, 20), now), 'Today');
    assert.equal(bucketOf(at(2026, 3, 19), now), 'Yesterday');
    assert.equal(bucketOf(at(2026, 3, 17), now), 'This week');
    assert.equal(bucketOf(at(2026, 3, 5), now), 'This month');
    assert.equal(bucketOf(at(2025, 12, 5), now), 'Earlier');
  });
});

describe('compactCount', () => {
  test('keeps the header a stable width as the archive grows', () => {
    assert.equal(compactCount(7), '7');
    assert.equal(compactCount(999), '999');
    assert.equal(compactCount(1200), '1.2k');
    assert.equal(compactCount(15400), '15k');
  });
});

describe('readingLabel', () => {
  test('does not say 1 mins', () => {
    assert.equal(readingLabel(1), '1 min read');
    assert.equal(readingLabel(12), '12 min read');
  });
});

describe('formatBytes', () => {
  test('steps through the units', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  });
});
