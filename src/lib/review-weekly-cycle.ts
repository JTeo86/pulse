const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;

  const weekdayText = get('weekday') || 'Mon';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_TO_INDEX[weekdayText] ?? 1,
  };
}

function toIsoDateUtc(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getCompletedReviewWeekRange(now: Date, venueTimeZone: string) {
  const local = getZonedParts(now, venueTimeZone);
  const localDateUtc = new Date(Date.UTC(local.year, local.month - 1, local.day));

  const daysSinceLastCompletedSunday = local.weekday === 0 ? 7 : local.weekday;

  const weekEndUtc = new Date(localDateUtc);
  weekEndUtc.setUTCDate(weekEndUtc.getUTCDate() - daysSinceLastCompletedSunday);

  const weekStartUtc = new Date(weekEndUtc);
  weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() - 6);

  const scheduledRunDateUtc = new Date(weekEndUtc);
  scheduledRunDateUtc.setUTCDate(scheduledRunDateUtc.getUTCDate() + 1);

  return {
    weekStart: toIsoDateUtc(weekStartUtc),
    weekEnd: toIsoDateUtc(weekEndUtc),
    expectedRunLocalLabel: `${toIsoDateUtc(scheduledRunDateUtc)} 08:00 ${venueTimeZone}`,
    localWeekday: local.weekday,
    localHour: local.hour,
  };
}
