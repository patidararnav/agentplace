export const WEEKLY_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeeklyDay = (typeof WEEKLY_DAYS)[number];
export type WeeklyAvailability = Record<string, string[] | null>;

export function createWeeklyAvailability(defaultSlots: string[] | null = null): WeeklyAvailability {
  const out: WeeklyAvailability = {};
  for (const day of WEEKLY_DAYS) {
    out[day] = defaultSlots ? [...defaultSlots] : null;
  }
  return out;
}

function normalizeDaySlots(raw: unknown): string[] | null {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    const token = raw.trim();
    return token ? [token] : null;
  }

  if (!Array.isArray(raw)) return null;

  // Backward-compat: legacy pair format like ["09:00", "17:00"].
  if (
    raw.length === 2
    && typeof raw[0] === 'string'
    && typeof raw[1] === 'string'
    && !String(raw[0]).includes('-')
    && !String(raw[1]).includes('-')
  ) {
    return [`${String(raw[0]).trim()}-${String(raw[1]).trim()}`];
  }

  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const token = item.trim();
      if (token) out.push(token);
      continue;
    }
    if (Array.isArray(item) && item.length === 2) {
      const start = String(item[0] ?? '').trim();
      const end = String(item[1] ?? '').trim();
      if (start && end) out.push(`${start}-${end}`);
    }
  }

  return out.length > 0 ? out : null;
}

function readDayValue(raw: Record<string, unknown>, day: WeeklyDay): unknown {
  const lower = day;
  const title = `${day.slice(0, 1).toUpperCase()}${day.slice(1)}`;
  const upper = day.toUpperCase();
  return raw[lower] ?? raw[title] ?? raw[upper];
}

export function normalizeWeeklyAvailability(
  raw: unknown,
  defaultSlots: string[] | null = null
): WeeklyAvailability {
  const normalized = createWeeklyAvailability(defaultSlots);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalized;

  const dict = raw as Record<string, unknown>;
  for (const day of WEEKLY_DAYS) {
    const slots = normalizeDaySlots(readDayValue(dict, day));
    if (slots != null) normalized[day] = slots;
  }

  return normalized;
}

