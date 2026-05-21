/**
 * Parses a free-form date string from ticket imports into a JS Date at midnight local time.
 * Returns null if the string is missing, "TBD", or unrecognisable.
 */
export function parseEventDate(s: string | null | undefined): Date | null {
  if (!s || s.trim().toLowerCase() === 'tbd') return null;

  // ISO: 2025-12-15
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));

  // US short: Dec 15, 2025 / December 15 2025 / Dec 15 2025
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const lower = s.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  const dayMatch = lower.match(/\b(\d{1,2})\b/);
  const day = dayMatch ? parseInt(dayMatch[1]) : null;
  for (let i = 0; i < MONTHS.length; i++) {
    if (lower.includes(MONTHS[i])) {
      return new Date(year, i, day ?? 1);
    }
  }

  // Numeric: MM/DD/YYYY or DD/MM/YYYY — assume MM/DD/YYYY
  const slash = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const y = parseInt(slash[3]) < 100 ? 2000 + parseInt(slash[3]) : parseInt(slash[3]);
    return new Date(y, parseInt(slash[1]) - 1, parseInt(slash[2]));
  }

  return null;
}

/** Returns true if the event is strictly in the past (before today's midnight). */
export function isEventPast(dateStr: string | null | undefined): boolean {
  const d = parseEventDate(dateStr);
  if (!d) return false; // unknown date → treat as upcoming
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/** Days from today until the event (negative if past). Returns null if date unknown. */
export function daysUntil(dateStr: string | null | undefined): number | null {
  const d = parseEventDate(dateStr);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
