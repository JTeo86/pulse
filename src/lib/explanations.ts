export interface ExplanationContext {
  content_gap?: string[] | null;
  review_signal?: string[] | null;
  asset_usage?: {
    recent_upload?: boolean;
    reuse_frequency?: 'low' | 'balanced' | 'high';
  } | null;
  timing?: {
    day_of_week?: string | null;
    seasonality?: string | null;
    event?: string | null;
  } | null;
}

const fallbackBullets = [
  'Maintains consistent visibility',
  'Keeps your content active this week',
];

function normalizeGap(gap: string) {
  const value = gap.toLowerCase();
  if (value.includes('friday')) return 'You had no Friday dinner visibility';
  if (value.includes('weekend')) return 'Weekend visibility needed a boost';
  if (value.includes('lunch')) return 'Lunch-hour visibility needed support';
  return `Fills a ${gap.replace(/^missing\s+/i, '').toLowerCase()} gap`;
}

function normalizeReviewSignal(signal: string) {
  const lower = signal.toLowerCase();
  if (lower.includes('trend') || lower.includes('praise')) return signal;
  if (lower.includes('food')) return 'Food quality is trending in recent reviews';
  if (lower.includes('service')) return 'Service mentions are shaping this week’s messaging';
  if (lower.includes('ambiance') || lower.includes('atmosphere')) return 'Guest vibe feedback is trending this week';
  return signal;
}

export function generateExplanation(context: ExplanationContext): string[] {
  const bullets: string[] = [];

  if (context.content_gap?.length) {
    context.content_gap.forEach((gap) => bullets.push(normalizeGap(gap)));
  }

  if (context.review_signal?.length) {
    context.review_signal.forEach((signal) => bullets.push(normalizeReviewSignal(signal)));
  }

  if (context.asset_usage?.recent_upload) {
    bullets.push('Puts your latest uploads to work quickly');
  }

  if (context.asset_usage?.reuse_frequency === 'low') {
    bullets.push('Balances your weekly content mix');
  }

  if (context.asset_usage?.reuse_frequency === 'high') {
    bullets.push('Refreshes recurring formats with a new angle');
  }

  if (context.timing?.event) {
    bullets.push(`Aligned with ${context.timing.event}`);
  }

  if (context.timing?.day_of_week) {
    bullets.push(`Built for ${context.timing.day_of_week}`);
  }

  if (context.timing?.seasonality) {
    bullets.push(`Matches ${context.timing.seasonality}`);
  }

  const unique = Array.from(new Set(bullets)).filter(Boolean);
  if (unique.length < 2) {
    unique.push(...fallbackBullets);
  }

  return unique.slice(0, 4);
}
