export type PerformanceCategory = 'food' | 'drinks' | 'venue';
export type PerformanceLabel = 'Performing well' | 'Average' | 'Needs improvement';

export type PerformanceFeedbackPost = {
  id: string;
  title?: string | null;
  caption?: string | null;
  scheduledFor?: string | null;
  createdAt?: string | null;
  category?: PerformanceCategory | null;
  reused?: boolean;
  engagementScore?: number | null;
};

export type PerformanceFeedbackInput = {
  posts?: PerformanceFeedbackPost[];
  reviewMentions?: string[];
  frequencyPerWeek?: number;
};

export type WeeklyPulseReport = {
  title: 'Your Weekly Pulse Report';
  whatWorked: string[];
  whatToImprove: string[];
  whatToDoNext: string[];
};

export function generatePerformanceInsights(input: PerformanceFeedbackInput): string[] {
  const normalized = normalizeInput(input);
  const categoryCounts = countByCategory(normalized.posts);
  const total = normalized.posts.length;
  const eveningPosts = normalized.posts.filter((post) => isEvening(post.scheduledFor)).length;
  const reusedPosts = normalized.posts.filter((post) => post.reused).length;

  const insights: string[] = [];

  const strongest = topCategory(categoryCounts);
  if (strongest && categoryCounts[strongest] > 0) {
    insights.push(`${labelForCategory(strongest)} content is your strongest category`);
  }

  if (eveningPosts >= 2 && eveningPosts >= Math.ceil(total * 0.35)) {
    insights.push('Evening content is getting more engagement');
  }

  if (categoryCounts.drinks <= Math.max(0, Math.floor(total * 0.2))) {
    insights.push('You have low drinks visibility');
  }

  if (reusedPosts >= 3) {
    insights.push('Some reused content is underperforming — refresh your visuals');
  }

  if (normalized.frequencyPerWeek >= 3) {
    insights.push('You are consistent this week');
  }

  const reviewText = normalized.reviewMentions.join(' ');
  if (reviewText.includes('sushi')) {
    insights.push('Your sushi posts are performing strongly');
  }

  if (insights.length === 0) {
    return [
      'Food content is your strongest category',
      'You have low drinks visibility',
      'You are consistent this week',
    ];
  }

  return uniq(insights).slice(0, 5);
}

export function generateWeeklyPulseReport(input: PerformanceFeedbackInput): WeeklyPulseReport {
  const normalized = normalizeInput(input);
  const categoryCounts = countByCategory(normalized.posts);
  const insights = generatePerformanceInsights(input);

  const whatWorked: string[] = [];
  const whatToImprove: string[] = [];
  const whatToDoNext: string[] = [];

  const strongest = topCategory(categoryCounts);
  if (strongest) {
    whatWorked.push(`${labelForCategory(strongest)} content is working for you`);
  }
  if (normalized.posts.some((post) => isFriday(post.scheduledFor))) {
    whatWorked.push('Friday posts performed well');
  }
  if (whatWorked.length === 0) {
    whatWorked.push('Your posting rhythm stayed active this week');
  }

  if (categoryCounts.drinks === 0) {
    whatToImprove.push('No drinks content this week');
  }
  if (!normalized.posts.some((post) => isLunch(post.scheduledFor, `${post.title || ''} ${post.caption || ''}`))) {
    whatToImprove.push('Low lunch visibility');
  }
  if (normalized.posts.filter((post) => post.reused).length >= 3) {
    whatToImprove.push('Too many repeated visuals this week');
  }
  if (whatToImprove.length === 0) {
    whatToImprove.push('Keep balancing food, drinks, and venue content');
  }

  if (categoryCounts.drinks < 2) {
    whatToDoNext.push('Post 2 drink-focused posts');
  }
  if (!normalized.posts.some((post) => isLunch(post.scheduledFor, `${post.title || ''} ${post.caption || ''}`))) {
    whatToDoNext.push('Add lunch menu photos');
  }
  if (strongest) {
    whatToDoNext.push(`Create more ${labelForCategory(strongest).toLowerCase()} stories next week`);
  }
  if (whatToDoNext.length === 0) {
    whatToDoNext.push('Repeat your best-performing format next week');
  }

  // Keep this human and concise.
  return {
    title: 'Your Weekly Pulse Report',
    whatWorked: uniq(whatWorked).slice(0, 3),
    whatToImprove: uniq(whatToImprove).slice(0, 3),
    whatToDoNext: uniq(whatToDoNext.concat(insights.some((i) => i.includes('low drinks')) ? ['Post a drinks highlight during evening hours'] : [])).slice(0, 3),
  };
}

export function getPostPerformanceLabel(post: PerformanceFeedbackPost, input: PerformanceFeedbackInput): PerformanceLabel {
  const normalized = normalizeInput(input);
  const counts = countByCategory(normalized.posts);
  const category = detectCategory(post);

  let score = 0;
  if (post.engagementScore != null) {
    if (post.engagementScore >= 7) score += 2;
    else if (post.engagementScore <= 3) score -= 2;
  }

  if (category === 'food' && counts.food >= counts.drinks) score += 1;
  if (category === 'drinks' && counts.drinks < Math.max(1, Math.floor(normalized.posts.length * 0.2))) score -= 1;
  if (isEvening(post.scheduledFor)) score += 1;
  if (post.reused) score -= 1;

  if (score >= 2) return 'Performing well';
  if (score <= -1) return 'Needs improvement';
  return 'Average';
}

export function getPerformanceFeedbackExamples() {
  const scenarios: PerformanceFeedbackInput[] = [
    {
      posts: [
        { id: '1', title: 'Sushi platter', scheduledFor: '2026-04-03T19:00:00Z' },
        { id: '2', title: 'Chef special sushi', scheduledFor: '2026-04-04T20:00:00Z' },
        { id: '3', title: 'Dining room vibe', scheduledFor: '2026-04-05T18:00:00Z' },
      ],
      reviewMentions: ['great sushi', 'loved the nigiri'],
      frequencyPerWeek: 3,
    },
    {
      posts: [
        { id: '4', title: 'Burger close-up', scheduledFor: '2026-04-02T12:00:00Z', reused: true },
        { id: '5', title: 'Burger close-up', scheduledFor: '2026-04-03T12:00:00Z', reused: true },
        { id: '6', title: 'Burger close-up', scheduledFor: '2026-04-04T12:00:00Z', reused: true },
      ],
      reviewMentions: ['needs more drink options'],
      frequencyPerWeek: 3,
    },
    {
      posts: [{ id: '7', title: 'Venue entrance', scheduledFor: '2026-04-06T10:00:00Z' }],
      reviewMentions: [],
      frequencyPerWeek: 1,
    },
  ];

  return scenarios.map((scenario) => ({
    input: scenario,
    insights: generatePerformanceInsights(scenario),
    report: generateWeeklyPulseReport(scenario),
  }));
}

function normalizeInput(input: PerformanceFeedbackInput): Required<PerformanceFeedbackInput> {
  return {
    posts: (input.posts || []).map((post) => ({
      ...post,
      category: post.category || detectCategory(post),
      reused: Boolean(post.reused),
    })),
    reviewMentions: (input.reviewMentions || []).map((mention) => mention.toLowerCase()),
    frequencyPerWeek: input.frequencyPerWeek ?? (input.posts?.length || 0),
  };
}

function detectCategory(post: Pick<PerformanceFeedbackPost, 'title' | 'caption' | 'category'>): PerformanceCategory {
  if (post.category) return post.category;
  const text = `${post.title || ''} ${post.caption || ''}`.toLowerCase();
  if (/(cocktail|drink|wine|beer|mocktail|beverage|bar)/.test(text)) return 'drinks';
  if (/(interior|venue|atmosphere|ambience|dining room|patio|space)/.test(text)) return 'venue';
  return 'food';
}

function countByCategory(posts: Required<PerformanceFeedbackInput>['posts']) {
  return posts.reduce(
    (acc, post) => {
      const category = detectCategory(post);
      acc[category] += 1;
      return acc;
    },
    { food: 0, drinks: 0, venue: 0 } as Record<PerformanceCategory, number>,
  );
}

function topCategory(counts: Record<PerformanceCategory, number>): PerformanceCategory | null {
  const entries = Object.entries(counts) as [PerformanceCategory, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : null;
}

function labelForCategory(category: PerformanceCategory): string {
  if (category === 'drinks') return 'Drinks';
  if (category === 'venue') return 'Venue';
  return 'Food';
}

function isEvening(value?: string | null): boolean {
  if (!value) return false;
  const hour = new Date(value).getHours();
  return hour >= 17 && hour <= 22;
}

function isLunch(value?: string | null, text?: string): boolean {
  if (text?.toLowerCase().includes('lunch')) return true;
  if (!value) return false;
  const hour = new Date(value).getHours();
  return hour >= 11 && hour <= 15;
}

function isFriday(value?: string | null): boolean {
  if (!value) return false;
  return new Date(value).getDay() === 5;
}

function uniq(values: string[]) {
  return Array.from(new Set(values));
}
