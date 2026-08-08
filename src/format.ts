/**
 * Relative day label for a saved timestamp.
 *
 * Compares calendar days, not elapsed hours. Something saved at 23:50 is
 * "Yesterday" at 00:10, and an elapsed-hours check would still call it
 * "Today", which reads as wrong to anyone who has slept since.
 */
export function dayLabel(savedAt: number, now: number): string {
  const a = startOfDay(savedAt);
  const b = startOfDay(now);
  const days = Math.round((b - a) / 86_400_000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Last week' : `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  return months === 1 ? 'Last month' : `${months} months ago`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Group into the buckets the list renders under. Order is preserved within a bucket. */
export function bucketOf(savedAt: number, now: number): string {
  const label = dayLabel(savedAt, now);
  if (label === 'Today' || label === 'Yesterday') return label;
  const days = Math.round((startOfDay(now) - startOfDay(savedAt)) / 86_400_000);
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return 'Earlier';
}

/** "12 min read", and "1 min read" rather than "1 mins read". */
export function readingLabel(minutes: number): string {
  return `${minutes} min read`;
}

/** Compact count for the header, so a big archive does not widen the layout. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const thousands = n / 1000;
  // One decimal below 10k, none above, so the width stays stable.
  return thousands < 10 ? `${thousands.toFixed(1)}k` : `${Math.round(thousands)}k`;
}

/** Bytes as a short human string, for the storage line in settings. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
