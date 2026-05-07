export type ContentRequest = {
  id: string;
  title: string;
  context?: string;
  ctaLabel: 'Open Assets';
  ctaTo: '/assets';
  priority: number;
  reason: 'content_gap' | 'content_mix' | 'low_asset_count' | 'review_signal';
};

export type ContentRequestContext = {
  coverage: {
    hasLunch: boolean;
    hasDinner: boolean;
    hasWeekend: boolean;
  };
  assets: {
    unusedImageCount: number;
  };
  reviewSignals: {
    mentions: string[];
  };
  contentMix: {
    hasFood: boolean;
    hasDrinks: boolean;
    hasVenue: boolean;
  };
};

const DEFAULT_UNUSED_THRESHOLD = 8;

export function generateContentRequests(
  context: Partial<ContentRequestContext> | null | undefined,
  options?: { maxRequests?: number; unusedThreshold?: number },
): ContentRequest[] {
  const maxRequests = clamp(options?.maxRequests ?? 4, 2, 4);
  const unusedThreshold = Math.max(1, options?.unusedThreshold ?? DEFAULT_UNUSED_THRESHOLD);

  const normalized: ContentRequestContext = {
    coverage: {
      hasLunch: context?.coverage?.hasLunch ?? true,
      hasDinner: context?.coverage?.hasDinner ?? true,
      hasWeekend: context?.coverage?.hasWeekend ?? true,
    },
    assets: {
      unusedImageCount: context?.assets?.unusedImageCount ?? unusedThreshold,
    },
    reviewSignals: {
      mentions: context?.reviewSignals?.mentions?.map((mention) => mention.toLowerCase()) ?? [],
    },
    contentMix: {
      hasFood: context?.contentMix?.hasFood ?? true,
      hasDrinks: context?.contentMix?.hasDrinks ?? true,
      hasVenue: context?.contentMix?.hasVenue ?? true,
    },
  };

  const requests: ContentRequest[] = [];
  const pushRequest = (request: ContentRequest) => {
    if (requests.some((existing) => existing.id === request.id)) return;
    requests.push(request);
  };

  // 1) Content gaps — highest priority.
  if (!normalized.coverage.hasLunch) {
    pushRequest({
      id: 'gap-lunch',
      title: 'Capture your lunch dishes',
      context: 'You have no lunch content this week.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 100,
      reason: 'content_gap',
    });
  }

  if (!normalized.coverage.hasDinner) {
    pushRequest({
      id: 'gap-dinner',
      title: 'Capture dinner service',
      context: 'Dinner coverage is missing this week.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 96,
      reason: 'content_gap',
    });
  }

  if (!normalized.coverage.hasWeekend) {
    pushRequest({
      id: 'gap-weekend',
      title: 'Take photos for weekend promotion',
      context: 'You have no weekend content queued.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 92,
      reason: 'content_gap',
    });
  }

  // 2) Content mix imbalance.
  if (!normalized.contentMix.hasDrinks) {
    pushRequest({
      id: 'mix-drinks',
      title: 'Photograph your cocktails or drinks',
      context: 'Your current mix has no drinks content.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 74,
      reason: 'content_mix',
    });
  }

  if (!normalized.contentMix.hasVenue) {
    pushRequest({
      id: 'mix-venue',
      title: 'Capture your dining room or atmosphere',
      context: 'Venue and atmosphere shots are missing.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 72,
      reason: 'content_mix',
    });
  }

  // 3) Low asset count.
  if (normalized.assets.unusedImageCount < unusedThreshold) {
    pushRequest({
      id: 'assets-low',
      title: 'Add more photos to keep content running',
      context: `Only ${normalized.assets.unusedImageCount} unused photos are available.`,
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 68,
      reason: 'low_asset_count',
    });
  }

  // 4) Review-driven signals.
  if (normalized.reviewSignals.mentions.some((mention) => mention.includes('dessert'))) {
    pushRequest({
      id: 'review-desserts',
      title: 'Capture your desserts',
      context: 'Recent reviews keep mentioning desserts.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 66,
      reason: 'review_signal',
    });
  }

  if (normalized.reviewSignals.mentions.some((mention) => mention.includes('cocktail'))) {
    pushRequest({
      id: 'review-cocktails',
      title: 'Photograph your drinks',
      context: 'Recent reviews mention cocktails often.',
      ctaLabel: 'Open Assets',
      ctaTo: '/assets',
      priority: 65,
      reason: 'review_signal',
    });
  }

  return requests
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxRequests);
}

export function getContentRequestExamples() {
  return [
    {
      name: 'Scenario 1: Missing lunch + weak assets',
      context: {
        coverage: { hasLunch: false, hasDinner: true, hasWeekend: true },
        assets: { unusedImageCount: 3 },
        reviewSignals: { mentions: [] },
        contentMix: { hasFood: true, hasDrinks: true, hasVenue: true },
      } satisfies ContentRequestContext,
      output: generateContentRequests({
        coverage: { hasLunch: false, hasDinner: true, hasWeekend: true },
        assets: { unusedImageCount: 3 },
        reviewSignals: { mentions: [] },
        contentMix: { hasFood: true, hasDrinks: true, hasVenue: true },
      }),
    },
    {
      name: 'Scenario 2: Mix imbalance + dessert reviews',
      context: {
        coverage: { hasLunch: true, hasDinner: true, hasWeekend: true },
        assets: { unusedImageCount: 14 },
        reviewSignals: { mentions: ['desserts', 'dessert menu', 'service'] },
        contentMix: { hasFood: true, hasDrinks: false, hasVenue: false },
      } satisfies ContentRequestContext,
      output: generateContentRequests({
        coverage: { hasLunch: true, hasDinner: true, hasWeekend: true },
        assets: { unusedImageCount: 14 },
        reviewSignals: { mentions: ['desserts', 'dessert menu', 'service'] },
        contentMix: { hasFood: true, hasDrinks: false, hasVenue: false },
      }),
    },
    {
      name: 'Scenario 3: Dinner + weekend gaps with cocktail demand',
      context: {
        coverage: { hasLunch: true, hasDinner: false, hasWeekend: false },
        assets: { unusedImageCount: 10 },
        reviewSignals: { mentions: ['cocktails', 'cocktail bar'] },
        contentMix: { hasFood: true, hasDrinks: false, hasVenue: true },
      } satisfies ContentRequestContext,
      output: generateContentRequests({
        coverage: { hasLunch: true, hasDinner: false, hasWeekend: false },
        assets: { unusedImageCount: 10 },
        reviewSignals: { mentions: ['cocktails', 'cocktail bar'] },
        contentMix: { hasFood: true, hasDrinks: false, hasVenue: true },
      }),
    },
  ] as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
