/**
 * A short live-clock label for a match, e.g. "LIVE 67'".
 *
 * Prefers the exact minute from the feed; when that is missing it estimates the
 * minute from kickoff time, correcting for the ~15' half-time break so the
 * second half doesn't read too high. Half-time (PAUSED) shows "HT". Returns
 * plain "LIVE" when no usable minute can be derived.
 */
export function liveLabel(
  status: string,
  utcDate: string | null,
  apiMinute?: number | null
): string {
  if (status === 'PAUSED') return 'HT';
  if (status !== 'IN_PLAY') return '';
  const minute = liveMinute(utcDate, apiMinute);
  return minute ? `LIVE ${minute}'` : 'LIVE';
}

/** The current match minute (number only), or null if it can't be determined. */
export function liveMinute(utcDate: string | null, apiMinute?: number | null): number | null {
  if (apiMinute != null && apiMinute > 0) return apiMinute;
  if (!utcDate) return null;
  const elapsed = Math.floor((Date.now() - new Date(utcDate).getTime()) / 60_000);
  if (elapsed < 0) return null;
  let minute: number;
  if (elapsed <= 45) minute = Math.max(1, elapsed);
  else if (elapsed < 60) minute = 45; // late first half / around the break
  else minute = elapsed - 15; // discount the half-time break in the second half
  return Math.min(minute, 120); // clamp through extra time
}
