import type { ShiftSetting } from '../types';

/**
 * Returns the shift ('A', 'B', 'C') for a given timestamp based on configured shift settings.
 * Handles Date objects, timestamps, or ISO strings in the local manufacturing timezone.
 * Falls back to standard industry shifts (A: 06:00-14:00, B: 14:00-22:00, C: 22:00-06:00).
 */
export function getShiftForTimestamp(
  timestamp?: Date | string | number | null,
  shiftSettings?: ShiftSetting[]
): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  if (isNaN(d.getTime())) return 'A';

  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ct = hours + minutes / 60;

  if (shiftSettings && shiftSettings.length > 0) {
    for (const s of shiftSettings) {
      const rawStart = s.startTime || (s as any).start_time;
      const rawEnd = s.endTime || (s as any).end_time;
      if (!rawStart || !rawEnd) continue;

      const [sh, sm] = rawStart.split(':').map(Number);
      const [eh, em] = rawEnd.split(':').map(Number);
      const sv = sh + (sm || 0) / 60;
      const ev = eh + (em || 0) / 60;

      if (sv < ev) {
        if (ct >= sv && ct < ev) return s.id;
      } else {
        // Crosses midnight (e.g. 22:00 to 06:00)
        if (ct >= sv || ct < ev) return s.id;
      }
    }
  }

  // Fallback defaults (standard factory shifts)
  if (ct >= 6 && ct < 14) return 'A';
  if (ct >= 14 && ct < 22) return 'B';
  return 'C';
}
