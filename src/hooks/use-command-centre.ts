import { useQuery } from '@tanstack/react-query';
import { addDays, differenceInCalendarDays, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';

export type OpportunityType =
  | 'revenue'
  | 'reputation'
  | 'visibility'
  | 'lead_referral'
  | 'seasonal'
  | 'event'
  | 'retention';

export type OpportunityPriority = 'high' | 'medium' | 'low';
export type OpportunityStatus = 'open' | 'planned' | 'tracked';

export interface CommandActionItem {
  id: string;
  title: string;
  reason: string;
  status: string;
  ctaLabel: string;
  ctaTo: string;
  priority?: OpportunityPriority;
}

export interface CommandOpportunity {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  source: string;
  priority: OpportunityPriority;
  status: OpportunityStatus;
  suggestedAction: string;
  ctaLabel: string;
  ctaTo: string;
}

export interface AssetRequestTask {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
}

interface ReviewsThemeRollup {
  key: 'food' | 'service' | 'ambiance' | 'value' | 'drinks';
  praise: number;
  complaints: number;
}

interface CommandCentrePayload {
  approvals: CommandActionItem[];
  reputation: {
    pendingReplies: number;
    urgentNegativeReviews: number;
    recurringComplaintTheme: string | null;
    recurringPraiseTheme: string | null;
    responseCoverageLabel: string;
  };
  visibility: {
    daysCoveredAhead: number;
    missingTradingPeriods: string[];
    staleCampaignCount: number;
    noRecentAssetSignal: boolean;
    lastAssetAt: string | null;
  };
  opportunities: CommandOpportunity[];
  activity: CommandActionItem[];
  assetTasks: AssetRequestTask[];
  counts: {
    pendingCampaignApprovals: number;
    pendingPublishApprovals: number;
    pendingReferralVerifications: number;
    trackedReferrals: number;
  };
}

const THEME_KEYWORDS: Record<ReviewsThemeRollup['key'], string[]> = {
  food: ['food', 'dish', 'menu', 'meal', 'taste', 'dessert', 'brunch'],
  drinks: ['cocktail', 'cocktails', 'drink', 'drinks', 'wine', 'beer', 'mocktail', 'spritz'],
  service: ['service', 'staff', 'server', 'host', 'manager', 'friendly', 'slow', 'wait'],
  ambiance: ['ambiance', 'atmosphere', 'music', 'lighting', 'decor', 'vibe', 'terrace', 'patio'],
  value: ['value', 'price', 'expensive', 'overpriced', 'worth', 'portion', 'bill', 'affordable'],
};

const THEME_LABELS: Record<ReviewsThemeRollup['key'], string> = {
  food: 'Food quality',
  drinks: 'Drinks and cocktails',
  service: 'Service',
  ambiance: 'Atmosphere',
  value: 'Value perception',
};

function getPriorityFromCount(count: number): OpportunityPriority {
  if (count >= 4) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

function getCoverageSummary(scheduledItems: Array<{ scheduled_for: string | null }>) {
  const coveredDays = new Set<number>();
  for (const item of scheduledItems) {
    if (!item.scheduled_for) continue;
    coveredDays.add(new Date(item.scheduled_for).getDay());
  }

  const missingTradingPeriods: string[] = [];
  if (!coveredDays.has(5)) missingTradingPeriods.push('No Friday dinner push');
  if (!coveredDays.has(6) && !coveredDays.has(0)) missingTradingPeriods.push('No weekend visibility');
  if (![1, 2, 3, 4].some((day) => coveredDays.has(day))) missingTradingPeriods.push('No weekday lunch coverage');

  return {
    daysCoveredAhead: coveredDays.size,
    missingTradingPeriods,
  };
}

function buildThemeRollups(reviews: Array<{ review_text: string | null; rating: number | null }>) {
  const map: Record<ReviewsThemeRollup['key'], ReviewsThemeRollup> = {
    food: { key: 'food', praise: 0, complaints: 0 },
    drinks: { key: 'drinks', praise: 0, complaints: 0 },
    service: { key: 'service', praise: 0, complaints: 0 },
    ambiance: { key: 'ambiance', praise: 0, complaints: 0 },
    value: { key: 'value', praise: 0, complaints: 0 },
  };

  for (const review of reviews) {
    const text = (review.review_text || '').toLowerCase();
    const theme = (Object.entries(THEME_KEYWORDS) as Array<[ReviewsThemeRollup['key'], string[]]>)
      .find(([_, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0];
    if (!theme) continue;

    if ((review.rating ?? 0) >= 4) map[theme].praise += 1;
    if ((review.rating ?? 5) <= 2) map[theme].complaints += 1;
  }

  return Object.values(map);
}

function getThemeSummary(rollups: ReviewsThemeRollup[]) {
  const praise = [...rollups].sort((a, b) => b.praise - a.praise)[0];
  const complaint = [...rollups].sort((a, b) => b.complaints - a.complaints)[0];

  return {
    praiseTheme: praise?.praise >= 2 ? THEME_LABELS[praise.key] : null,
    complaintTheme: complaint?.complaints >= 2 ? THEME_LABELS[complaint.key] : null,
    praiseRollup: praise?.praise >= 2 ? praise : null,
    complaintRollup: complaint?.complaints >= 2 ? complaint : null,
  };
}

export function useCommandCentre() {
  const { currentVenue } = useVenue();

  return useQuery({
    queryKey: ['command-centre', currentVenue?.id],
    enabled: !!currentVenue?.id,
    queryFn: async (): Promise<CommandCentrePayload> => {
      const venueId = currentVenue!.id;
      const now = new Date();
      const twoWeeksOut = addDays(now, 14).toISOString();
      const recentWindow = subDays(now, 30).toISOString();

      const [
        pendingRepliesRes,
        reviewsRes,
        contentDraftsRes,
        scheduledContentRes,
        plansRes,
        assetsRes,
        referralsRes,
        eventsRes,
      ] = await Promise.all([
        supabase
          .from('review_response_tasks')
          .select('id, review_text, rating, ai_priority, draft_response, author_name, created_at')
          .eq('venue_id', venueId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('reviews')
          .select('id, review_text, rating, review_date, created_at')
          .eq('venue_id', venueId)
          .gte('created_at', recentWindow)
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('content_items')
          .select('id, title, status, created_at, source_plan_title, caption_draft, scheduled_for')
          .eq('venue_id', venueId)
          .in('status', ['draft', 'pending_review'])
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('content_items')
          .select('scheduled_for')
          .eq('venue_id', venueId)
          .not('scheduled_for', 'is', null)
          .gte('scheduled_for', now.toISOString())
          .lt('scheduled_for', twoWeeksOut)
          .limit(120),
        supabase
          .from('venue_event_plans')
          .select('id, event_id, title, status, starts_at, created_at, is_archived')
          .eq('venue_id', venueId)
          .order('starts_at', { ascending: true }),
        supabase
          .from('content_assets')
          .select('id, title, created_at, source_type, asset_type, status')
          .eq('venue_id', venueId)
          .eq('asset_type', 'image')
          .in('source_type', ['upload', 'manual', 'guest_upload'])
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('referrals')
          .select('id, guest_name, status, created_at, booking_date, bill_amount, commission, source_type')
          .eq('venue_id', venueId)
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('events_catalog')
          .select('id, title, starts_at, category')
          .gte('starts_at', now.toISOString())
          .lte('starts_at', addDays(now, 30).toISOString())
          .or(`country_code.eq.${(currentVenue as any).country_code || 'GB'},country_code.is.null`)
          .order('starts_at', { ascending: true })
          .limit(24),
      ]);

      const pendingReplies = pendingRepliesRes.data ?? [];
      const reviews = reviewsRes.data ?? [];
      const contentDrafts = contentDraftsRes.data ?? [];
      const scheduledContent = scheduledContentRes.data ?? [];
      const plans = (plansRes.data ?? []).filter((plan: any) => !plan.is_archived);
      const assets = assetsRes.data ?? [];
      const referrals = referralsRes.data ?? [];
      const events = eventsRes.data ?? [];
      const planIds = plans.map((plan: any) => plan.id).filter(Boolean);
      const publishItems = planIds.length
        ? ((await supabase
            .from('plan_publish_items')
            .select('id, title, status, publish_date, reminder_at, plan_id, created_at')
            .in('plan_id', planIds)
            .order('created_at', { ascending: false })
            .limit(40)).data ?? []).filter((item: any) => !['published', 'archived'].includes(item.status))
        : [];

      const urgentNegativeReviews = pendingReplies.filter(
        (task: any) => (task.rating ?? 5) <= 2 || task.ai_priority === 'P1',
      ).length;
      const coverage = getCoverageSummary(scheduledContent);
      const staleCampaignCount = plans.filter((plan: any) => {
        if (['done', 'skipped', 'scheduled'].includes(plan.status)) return false;
        const ageDays = differenceInCalendarDays(now, new Date(plan.starts_at || plan.created_at));
        return ageDays >= 14;
      }).length;
      const lastAssetAt = assets[0]?.created_at || null;
      const noRecentAssetSignal = !lastAssetAt || differenceInCalendarDays(now, new Date(lastAssetAt)) >= 14;
      const reviewsRollups = buildThemeRollups(reviews);
      const { praiseTheme, complaintTheme, praiseRollup, complaintRollup } = getThemeSummary(reviewsRollups);
      const pendingReferralVerifications = referrals.filter((ref: any) => ['visited', 'bill_entered'].includes(ref.status)).length;
      const trackedReferrals = referrals.filter((ref: any) => !['created', 'submitted', 'clicked'].includes(ref.status)).length;

      const approvals: CommandActionItem[] = [
        ...pendingReplies.slice(0, 4).map((task: any) => ({
          id: `reply-${task.id}`,
          title: `Approve reply for ${task.author_name || 'recent review'}`,
          reason: (task.rating ?? 5) <= 2
            ? 'A low-rating guest review is still unanswered.'
            : 'Pulse drafted a reply that still needs approval.',
          status: task.ai_priority === 'P1' ? 'Urgent' : 'Pending approval',
          ctaLabel: 'Open Reputation',
          ctaTo: '/reputation/reviews?tab=inbox',
          priority: (task.rating ?? 5) <= 2 ? 'high' : 'medium',
        })),
        ...contentDrafts.slice(0, 3).map((item: any) => ({
          id: `content-${item.id}`,
          title: item.title || item.source_plan_title || 'Campaign draft waiting approval',
          reason: 'A campaign draft is prepared but still needs operator approval before publishing.',
          status: item.status === 'pending_review' ? 'In review' : 'Draft',
          ctaLabel: 'Review Assets',
          ctaTo: '/assets?tab=ready',
          priority: 'medium' as OpportunityPriority,
        })),
        ...publishItems
          .filter((item: any) => ['draft', 'ready'].includes(item.status))
          .slice(0, 3)
          .map((item: any) => ({
            id: `publish-${item.id}`,
            title: item.title || 'Publishing item awaiting approval',
            reason: 'This post is queued in publishing but has not been approved or sent yet.',
            status: item.status === 'ready' ? 'Ready to schedule' : 'Draft',
            ctaLabel: 'Open Publishing',
            ctaTo: '/publishing',
            priority: 'medium' as OpportunityPriority,
          })),
        ...referrals
          .filter((item: any) => ['visited', 'bill_entered'].includes(item.status))
          .slice(0, 3)
          .map((item: any) => ({
            id: `referral-${item.id}`,
            title: item.guest_name ? `Verify bill for ${item.guest_name}` : 'Verify referral booking bill',
            reason: 'Commission and payout progress are blocked until this booking is verified.',
            status: item.status === 'bill_entered' ? 'Bill entered' : 'Needs bill verification',
            ctaLabel: 'Open Referrals',
            ctaTo: '/referrals',
            priority: 'high' as OpportunityPriority,
          })),
      ].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority || 'medium'] - order[b.priority || 'medium'];
      });

      const plannedEventIds = new Set(plans.map((plan: any) => plan.event_id).filter(Boolean));
      const unplannedEvents = events.filter((event: any) => !plannedEventIds.has(event.id));

      const opportunities: CommandOpportunity[] = [];
      coverage.missingTradingPeriods.forEach((gap, index) => {
        opportunities.push({
          id: `gap-${index}`,
          type: 'visibility',
          title: gap,
          description: 'Upcoming coverage is weak in a trading window that matters commercially.',
          source: 'Visibility coverage',
          priority: 'high',
          status: 'open',
          suggestedAction: 'Create a campaign or scheduled post to close this visibility gap.',
          ctaLabel: 'Open Campaigns',
          ctaTo: '/campaigns',
        });
      });

      if (staleCampaignCount > 0) {
        opportunities.push({
          id: 'stale-campaigns',
          type: 'revenue',
          title: `${staleCampaignCount} campaign${staleCampaignCount === 1 ? '' : 's'} need a refresh`,
          description: 'Older campaign plans are still open and may no longer match what the venue needs this week.',
          source: 'Campaign coordination',
          priority: getPriorityFromCount(staleCampaignCount),
          status: 'tracked',
          suggestedAction: 'Review and update stale campaign plans before they drift further.',
          ctaLabel: 'Review Campaigns',
          ctaTo: '/campaigns',
        });
      }

      if (praiseRollup) {
        opportunities.push({
          id: `praise-${praiseRollup.key}`,
          type: praiseRollup.key === 'drinks' ? 'retention' : 'reputation',
          title: `Guests keep praising ${THEME_LABELS[praiseRollup.key].toLowerCase()}`,
          description: `${praiseRollup.praise} recent positive mentions point to a theme worth amplifying commercially.`,
          source: 'Review intelligence',
          priority: getPriorityFromCount(praiseRollup.praise),
          status: 'open',
          suggestedAction: `Turn this signal into a campaign while the guest sentiment is strong.`,
          ctaLabel: 'Build Campaign',
          ctaTo: '/campaigns',
        });
      }

      if (complaintRollup) {
        opportunities.push({
          id: `complaint-${complaintRollup.key}`,
          type: 'reputation',
          title: `${THEME_LABELS[complaintRollup.key]} needs attention`,
          description: `${complaintRollup.complaints} recent low-sentiment mentions show a risk trend.`,
          source: 'Review intelligence',
          priority: 'high',
          status: 'open',
          suggestedAction: 'Tighten review responses and prepare a service-recovery or expectation-setting campaign.',
          ctaLabel: 'Open Reputation',
          ctaTo: '/reputation/reviews?tab=inbox',
        });
      }

      if (unplannedEvents.length > 0) {
        const nextEvent = unplannedEvents[0] as any;
        opportunities.push({
          id: `event-${nextEvent.id}`,
          type: nextEvent.category === 'holiday' ? 'seasonal' : 'event',
          title: `${nextEvent.title} is coming up`,
          description: `No campaign plan exists yet for this ${nextEvent.category || 'event'} opportunity.`,
          source: 'Events calendar',
          priority: 'medium',
          status: 'open',
          suggestedAction: 'Create a campaign plan before the opportunity window closes.',
          ctaLabel: 'Open Opportunities',
          ctaTo: '/opportunities',
        });
      }

      if (pendingReferralVerifications > 0) {
        opportunities.push({
          id: 'referral-followup',
          type: 'lead_referral',
          title: `${pendingReferralVerifications} referral booking${pendingReferralVerifications === 1 ? '' : 's'} need follow-up`,
          description: 'Tracked partner demand is already in motion, but revenue capture is blocked until verification is complete.',
          source: 'Referral tracking',
          priority: getPriorityFromCount(pendingReferralVerifications),
          status: 'tracked',
          suggestedAction: 'Verify bills and move eligible bookings toward commission approval.',
          ctaLabel: 'Open Referrals',
          ctaTo: '/referrals',
        });
      }

      if (noRecentAssetSignal) {
        opportunities.push({
          id: 'fresh-assets',
          type: 'visibility',
          title: 'Fresh venue assets are running low',
          description: 'Recent campaign coverage is relying on older uploads and may feel repetitive.',
          source: 'Asset coverage',
          priority: 'medium',
          status: 'open',
          suggestedAction: 'Collect one or two new venue photos to support the next campaign cycle.',
          ctaLabel: 'Open Assets',
          ctaTo: '/assets',
        });
      }

      const activity: CommandActionItem[] = [
        {
          id: 'activity-replies',
          title: `${pendingReplies.filter((task: any) => Boolean(task.draft_response?.trim())).length} replies drafted`,
          reason: 'Pulse has prepared reply work in the review queue.',
          status: 'Prepared',
          ctaLabel: 'Open Reputation',
          ctaTo: '/reputation/reviews?tab=inbox',
        },
        {
          id: 'activity-opportunities',
          title: `${opportunities.length} opportunities detected`,
          reason: 'Visibility, review, event, and referral signals were analysed together.',
          status: 'Detected',
          ctaLabel: 'Open Opportunities',
          ctaTo: '/opportunities',
        },
        {
          id: 'activity-campaigns',
          title: `${contentDrafts.length} campaign draft${contentDrafts.length === 1 ? '' : 's'} prepared`,
          reason: 'Draft work exists and can be approved or refined.',
          status: contentDrafts.length > 0 ? 'Prepared' : 'Waiting',
          ctaLabel: 'Open Assets',
          ctaTo: '/assets',
        },
        {
          id: 'activity-visibility',
          title: `${coverage.missingTradingPeriods.length} visibility gap${coverage.missingTradingPeriods.length === 1 ? '' : 's'} found`,
          reason: 'Pulse checked the next two weeks for weak trading periods.',
          status: coverage.missingTradingPeriods.length > 0 ? 'Needs action' : 'Healthy',
          ctaLabel: 'Open Campaigns',
          ctaTo: '/campaigns',
        },
        {
          id: 'activity-referrals',
          title: `${trackedReferrals} referral${trackedReferrals === 1 ? '' : 's'} tracked`,
          reason: 'Lead and partner activity is being captured in the referral pipeline.',
          status: trackedReferrals > 0 ? 'Tracked' : 'Quiet',
          ctaLabel: 'Open Referrals',
          ctaTo: '/referrals',
        },
      ];

      const assetTasks: AssetRequestTask[] = [];
      if (praiseRollup?.key === 'drinks') {
        assetTasks.push({
          id: 'asset-drinks',
          title: 'Need a new cocktail photo',
          description: 'Guests are praising cocktails. Capture a fresh drinks image for the next campaign.',
          ctaLabel: 'Open Assets',
          ctaTo: '/assets',
        });
      }
      if ((praiseRollup?.key === 'ambiance' || complaintRollup?.key === 'ambiance') && noRecentAssetSignal) {
        assetTasks.push({
          id: 'asset-atmosphere',
          title: 'Need a Friday night atmosphere shot',
          description: 'A fresh room or terrace photo would strengthen upcoming visibility coverage.',
          ctaLabel: 'Open Assets',
          ctaTo: '/assets',
        });
      }
      if (coverage.missingTradingPeriods.some((gap) => gap.toLowerCase().includes('weekend'))) {
        assetTasks.push({
          id: 'asset-weekend',
          title: 'Need a weekend trading image',
          description: 'Capture a brunch, terrace, or busy-service image to support a weekend push.',
          ctaLabel: 'Open Assets',
          ctaTo: '/assets',
        });
      }
      if (assetTasks.length === 0 && noRecentAssetSignal) {
        assetTasks.push({
          id: 'asset-generic',
          title: 'Need a fresh venue image',
          description: 'Upload one new dining, drinks, or atmosphere image to keep campaigns current.',
          ctaLabel: 'Open Assets',
          ctaTo: '/assets',
        });
      }

      const repliedEstimate = Math.max(reviews.length - pendingReplies.length, 0);
      const responseCoverageLabel = reviews.length > 0
        ? `${repliedEstimate}/${reviews.length} recent reviews covered`
        : 'No recent review volume yet';

      return {
        approvals,
        reputation: {
          pendingReplies: pendingReplies.length,
          urgentNegativeReviews,
          recurringComplaintTheme: complaintTheme,
          recurringPraiseTheme: praiseTheme,
          responseCoverageLabel,
        },
        visibility: {
          daysCoveredAhead: coverage.daysCoveredAhead,
          missingTradingPeriods: coverage.missingTradingPeriods,
          staleCampaignCount,
          noRecentAssetSignal,
          lastAssetAt,
        },
        opportunities: opportunities.slice(0, 12),
        activity,
        assetTasks: assetTasks.slice(0, 3),
        counts: {
          pendingCampaignApprovals: contentDrafts.length,
          pendingPublishApprovals: publishItems.filter((item: any) => ['draft', 'ready'].includes(item.status)).length,
          pendingReferralVerifications,
          trackedReferrals,
        },
      };
    },
  });
}
