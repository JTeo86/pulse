// Campaign Engine — config

export const primaryObjectives = [
  { id: 'drive_reservations', label: 'Drive reservations', description: 'Increase table bookings and covers' },
  { id: 'increase_weekday', label: 'Increase weekday covers', description: 'Fill quieter midweek periods' },
  { id: 'promote_item', label: 'Promote specific item', description: 'Spotlight a dish, drink, or experience' },
  { id: 'fill_slow_slots', label: 'Fill slow slots', description: 'Convert low-traffic periods into revenue' },
  { id: 'increase_repeat', label: 'Increase repeat visits', description: 'Retain and re-engage existing guests' },
  { id: 'improve_perception', label: 'Improve perception', description: 'Elevate brand positioning and reputation' },
  { id: 'launch_menu', label: 'Launch new menu', description: 'Announce and generate excitement around new offerings' },
];

export const secondaryFoci = [
  { id: 'increase_urgency', label: 'Increase urgency' },
  { id: 'increase_exclusivity', label: 'Increase exclusivity' },
  { id: 'premium_tone', label: 'Premium tone' },
  { id: 'remove_discount', label: 'Remove discount framing' },
  { id: 'highlight_reviews', label: 'Highlight reviews' },
];

export const optimiseTransformations = [
  { id: 'more_urgent', label: 'Make more urgent' },
  { id: 'more_premium', label: 'Make more premium' },
  { id: 'shorten_30', label: 'Shorten by 30%' },
  { id: 'more_exclusive', label: 'Increase exclusivity' },
  { id: 'focus_experience', label: 'Focus on experience' },
  { id: 'add_scarcity', label: 'Add scarcity' },
  { id: 'remove_discount_tone', label: 'Remove discount tone' },
];

export interface CampaignOpportunity {
  id: string;
  type: 'event' | 'review' | 'seasonal' | 'general';
  label: string;
  meta?: string;
  startDate?: string;
}
