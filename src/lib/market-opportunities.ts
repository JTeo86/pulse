import { addDays, format, isSameDay, parseISO } from 'date-fns';

export type OpportunityType = 'content' | 'reputation' | 'timing';

export interface MarketOpportunity {
  title: string;
  description: string;
  type: OpportunityType;
  suggestedAction: string;
}

export interface OpportunityEngineInput {
  scheduledDates: string[];
  recentReviews: Array<{ review_text: string | null; rating: number | null }>;
  lookaheadDays?: number;
  now?: Date;
}

const themeKeywords: Record<'food' | 'service' | 'ambiance' | 'value', string[]> = {
  food: ['food', 'dish', 'menu', 'tasting', 'meal', 'flavor', 'taste', 'dessert', 'cocktail', 'wine', 'drinks', 'omakase', 'brunch'],
  service: ['service', 'staff', 'server', 'host', 'manager', 'wait', 'friendly', 'rude', 'attentive', 'slow'],
  ambiance: ['ambiance', 'atmosphere', 'music', 'lighting', 'decor', 'vibe', 'terrace', 'patio', 'view'],
  value: ['value', 'price', 'expensive', 'overpriced', 'worth', 'portion', 'bill', 'cost', 'affordable'],
};

const themeCopy: Record<'food' | 'service' | 'ambiance' | 'value', { positiveTitle: string; positiveAction: string; negativeAction: string }> = {
  food: {
    positiveTitle: 'Food is getting strong praise',
    positiveAction: 'Feature your top dish in next week’s posts.',
    negativeAction: 'Address food consistency in replies and spotlight quality checks.',
  },
  service: {
    positiveTitle: 'Service is a standout',
    positiveAction: 'Share a team-focused post this week.',
    negativeAction: 'Post a service promise and tighten peak-hour staffing.',
  },
  ambiance: {
    positiveTitle: 'Guests are noticing the vibe',
    positiveAction: 'Schedule a peak-time atmosphere post to reinforce that demand signal.',
    negativeAction: 'Show improvements to comfort, pacing, and atmosphere.',
  },
  value: {
    positiveTitle: 'Guests feel the experience is worth it',
    positiveAction: 'Publish a “what guests love” value post.',
    negativeAction: 'Clarify menu value in posts and replies.',
  },
};

interface ThemeRollup {
  key: 'food' | 'service' | 'ambiance' | 'value';
  praise: number;
  complaints: number;
}

const US_FIXED_HOLIDAYS = [
  { month: 0, day: 1, label: 'New Year’s Day' },
  { month: 6, day: 4, label: 'Independence Day' },
  { month: 10, day: 11, label: 'Veterans Day' },
  { month: 11, day: 24, label: 'Christmas Eve' },
  { month: 11, day: 25, label: 'Christmas Day' },
  { month: 11, day: 31, label: 'New Year’s Eve' },
];

export function generateMarketOpportunities(input: OpportunityEngineInput): MarketOpportunity[] {
  const now = input.now ?? new Date();
  const lookaheadDays = input.lookaheadDays ?? 21;
  const scheduled = input.scheduledDates
    .map((value) => {
      try {
        return parseISO(value);
      } catch {
        return null;
      }
    })
    .filter((value): value is Date => Boolean(value));

  const opportunities: MarketOpportunity[] = [];
  const coverage = summarizeCoverage(scheduled, now, lookaheadDays);

  if (!coverage.hasFriday) {
    opportunities.push({
      title: 'No Friday dinner push detected',
      description: 'Friday is open in your upcoming schedule.',
      type: 'timing',
      suggestedAction: 'Add one Friday evening post to drive bookings.',
    });
  }

  if (!coverage.hasWeekend) {
    opportunities.push({
      title: 'Weekend visibility is low',
      description: 'No Saturday or Sunday content is scheduled.',
      type: 'timing',
      suggestedAction: 'Queue a weekend post, like brunch or cocktails.',
    });
  }

  if (coverage.scheduledCount < 3) {
    opportunities.push({
      title: 'Posting frequency is light',
      description: `Only ${coverage.scheduledCount} post${coverage.scheduledCount === 1 ? '' : 's'} are planned over the next ${lookaheadDays} days.`,
      type: 'content',
      suggestedAction: 'Add 2-3 posts to keep momentum.',
    });
  }

  const upcomingHoliday = findUpcomingHoliday(now, 10);
  if (upcomingHoliday && !scheduled.some((date) => Math.abs(date.getTime() - upcomingHoliday.date.getTime()) <= 86400000)) {
    opportunities.push({
      title: `${upcomingHoliday.label} is coming up`,
      description: `You have no content scheduled near ${format(upcomingHoliday.date, 'MMM d')}.`,
      type: 'timing',
      suggestedAction: `Create one ${upcomingHoliday.label.toLowerCase()} themed post.`,
    });
  }

  const themeRollups = rollupReviewThemes(input.recentReviews);
  const bestTheme = [...themeRollups].sort((a, b) => b.praise - a.praise)[0];
  if (bestTheme && bestTheme.praise >= 3) {
    opportunities.push({
      title: themeCopy[bestTheme.key].positiveTitle,
      description: `${bestTheme.praise} recent reviews praised this area.`,
      type: 'reputation',
      suggestedAction: themeCopy[bestTheme.key].positiveAction,
    });
  }

  const weakestTheme = [...themeRollups].sort((a, b) => b.complaints - a.complaints)[0];
  if (weakestTheme && weakestTheme.complaints >= 2) {
    opportunities.push({
      title: `${capitalize(weakestTheme.key)} needs attention`,
      description: `${weakestTheme.complaints} recent reviews flagged this as a weak spot.`,
      type: 'reputation',
      suggestedAction: themeCopy[weakestTheme.key].negativeAction,
    });
  }

  return opportunities.slice(0, 5);
}

export function buildContentSuggestions(opportunities: MarketOpportunity[]): string[] {
  return opportunities
    .filter((item) => item.type === 'content' || item.type === 'timing' || item.type === 'reputation')
    .map((item) => item.suggestedAction)
    .slice(0, 3);
}

export function buildReviewToContentSuggestions(opportunities: MarketOpportunity[]): string[] {
  return opportunities
    .filter((item) => item.type === 'reputation')
    .map((item) => `${item.title} → ${item.suggestedAction}`)
    .slice(0, 3);
}

function summarizeCoverage(scheduled: Date[], now: Date, lookaheadDays: number) {
  const end = addDays(now, lookaheadDays);
  const inWindow = scheduled.filter((item) => item >= now && item <= end);

  return {
    scheduledCount: inWindow.length,
    hasFriday: inWindow.some((date) => date.getDay() === 5),
    hasWeekend: inWindow.some((date) => date.getDay() === 6 || date.getDay() === 0),
  };
}

function findUpcomingHoliday(now: Date, daysAhead: number): { date: Date; label: string } | null {
  const year = now.getFullYear();
  const candidates = [year, year + 1].flatMap((y) => US_FIXED_HOLIDAYS.map((holiday) => ({ date: new Date(y, holiday.month, holiday.day), label: holiday.label })));

  for (const holiday of candidates) {
    const diffDays = Math.ceil((holiday.date.getTime() - now.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays <= daysAhead && !isSameDay(holiday.date, now)) {
      return holiday;
    }
  }

  return null;
}

function rollupReviewThemes(reviews: Array<{ review_text: string | null; rating: number | null }>): ThemeRollup[] {
  const map: Record<ThemeRollup['key'], ThemeRollup> = {
    food: { key: 'food', praise: 0, complaints: 0 },
    service: { key: 'service', praise: 0, complaints: 0 },
    ambiance: { key: 'ambiance', praise: 0, complaints: 0 },
    value: { key: 'value', praise: 0, complaints: 0 },
  };

  reviews.forEach((review) => {
    const text = (review.review_text ?? '').toLowerCase();
    const matchedTheme = (Object.entries(themeKeywords) as Array<[ThemeRollup['key'], string[]]>)
      .find(([_, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0];

    if (!matchedTheme) return;
    if ((review.rating ?? 0) >= 4) map[matchedTheme].praise += 1;
    if ((review.rating ?? 5) <= 2) map[matchedTheme].complaints += 1;
  });

  return Object.values(map);
}

function capitalize(value: string) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
