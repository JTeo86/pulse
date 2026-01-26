import { Mail, FileText, Megaphone, MessageSquare } from 'lucide-react';

export type CopyModule = 'email' | 'blog' | 'ad_copy' | 'sms_push';

// Module-specific goals
export const moduleGoals: Record<CopyModule, { id: string; label: string; description: string }[]> = {
  email: [
    { id: 'promote_event', label: 'Promote an Event', description: 'Drive attendance to an upcoming event' },
    { id: 'new_menu', label: 'New Menu / Product Launch', description: 'Announce and excite about new offerings' },
    { id: 'seasonal_offer', label: 'Seasonal or Limited-Time Offer', description: 'Highlight a time-sensitive promotion' },
    { id: 'customer_update', label: 'Customer Update / Announcement', description: 'Share important news or changes' },
    { id: 'brand_story', label: 'Brand Story / Relationship Building', description: 'Connect and build loyalty' },
    { id: 'fill_tables', label: 'Fill Empty Tables', description: 'Drive last-minute bookings' },
  ],
  blog: [
    { id: 'explain_concept', label: 'Explain a Concept', description: 'Educate readers about a topic' },
    { id: 'tell_story', label: 'Tell a Story', description: 'Share a narrative about your brand or team' },
    { id: 'promote_experience', label: 'Promote a Menu or Experience', description: 'Highlight what makes you special' },
    { id: 'answer_questions', label: 'Answer Common Questions (SEO)', description: 'Address FAQs for search visibility' },
    { id: 'seasonal_content', label: 'Seasonal or Trend-Led Content', description: 'Tap into current themes' },
    { id: 'local_guide', label: 'Local Discovery / Guides', description: 'Position as a local authority' },
  ],
  ad_copy: [
    { id: 'drive_bookings', label: 'Drive Immediate Bookings', description: 'Get people to reserve now' },
    { id: 'promote_offer', label: 'Promote an Event or Offer', description: 'Highlight a specific promotion' },
    { id: 'highlight_signature', label: 'Highlight a Signature Dish or Drink', description: 'Showcase your best' },
    { id: 'brand_awareness', label: 'Increase Brand Awareness', description: 'Get your name out there' },
    { id: 'retarget', label: 'Retarget Past Visitors', description: 'Bring back previous guests' },
    { id: 'test_message', label: 'Test a New Message', description: 'Try different angles' },
  ],
  sms_push: [
    { id: 'last_minute', label: 'Last-Minute Availability', description: 'Fill gaps quickly' },
    { id: 'limited_offer', label: 'Limited-Time Offer', description: 'Create urgency for a deal' },
    { id: 'event_reminder', label: 'Event Reminder', description: 'Remind about upcoming events' },
    { id: 'quick_announcement', label: 'Quick Announcement', description: 'Share brief news' },
    { id: 'vip_message', label: 'VIP / Loyalty Message', description: 'Reward your best guests' },
    { id: 'reengage', label: 'Re-engage Inactive Guests', description: 'Bring back lapsed customers' },
  ],
};

// Smart defaults based on goal
export const goalDefaults: Record<string, { tone: string; length: string; urgency: string; cta: string }> = {
  // Email goals
  promote_event: { tone: 'excited', length: 'medium', urgency: 'medium', cta: 'Reserve your spot' },
  new_menu: { tone: 'enthusiastic', length: 'medium', urgency: 'low', cta: 'View our new menu' },
  seasonal_offer: { tone: 'warm', length: 'short', urgency: 'medium', cta: 'Claim this offer' },
  customer_update: { tone: 'professional', length: 'short', urgency: 'low', cta: 'Learn more' },
  brand_story: { tone: 'storytelling', length: 'long', urgency: 'none', cta: 'Read our story' },
  fill_tables: { tone: 'urgent', length: 'short', urgency: 'high', cta: 'Book now' },
  // Blog goals
  explain_concept: { tone: 'educational', length: 'long', urgency: 'none', cta: 'Read more' },
  tell_story: { tone: 'storytelling', length: 'long', urgency: 'none', cta: 'Continue reading' },
  promote_experience: { tone: 'enthusiastic', length: 'medium', urgency: 'low', cta: 'Experience it yourself' },
  answer_questions: { tone: 'helpful', length: 'medium', urgency: 'none', cta: 'Get in touch' },
  seasonal_content: { tone: 'warm', length: 'medium', urgency: 'low', cta: 'Discover more' },
  local_guide: { tone: 'friendly', length: 'long', urgency: 'none', cta: 'Visit us' },
  // Ad goals
  drive_bookings: { tone: 'direct', length: 'short', urgency: 'high', cta: 'Book your table' },
  promote_offer: { tone: 'excited', length: 'short', urgency: 'medium', cta: 'Claim offer' },
  highlight_signature: { tone: 'premium', length: 'short', urgency: 'low', cta: 'Try it today' },
  brand_awareness: { tone: 'warm', length: 'short', urgency: 'none', cta: 'Discover us' },
  retarget: { tone: 'friendly', length: 'short', urgency: 'medium', cta: 'Come back soon' },
  test_message: { tone: 'neutral', length: 'short', urgency: 'low', cta: 'Learn more' },
  // SMS goals
  last_minute: { tone: 'urgent', length: 'very_short', urgency: 'high', cta: 'Book now' },
  limited_offer: { tone: 'urgent', length: 'very_short', urgency: 'high', cta: 'Grab it now' },
  event_reminder: { tone: 'friendly', length: 'very_short', urgency: 'medium', cta: 'See you there' },
  quick_announcement: { tone: 'direct', length: 'very_short', urgency: 'low', cta: 'Check it out' },
  vip_message: { tone: 'premium', length: 'very_short', urgency: 'low', cta: 'Exclusive for you' },
  reengage: { tone: 'warm', length: 'very_short', urgency: 'medium', cta: 'We miss you' },
};

// Preset shortcuts
export interface Preset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  defaults: {
    timing?: string;
    tone: string;
    urgency: string;
    length: string;
    ctaHint?: string;
    contextHint?: string;
  };
}

export const presets: Preset[] = [
  {
    id: 'tonight_only',
    label: 'Tonight only',
    emoji: '🌙',
    description: 'Same-day urgency',
    defaults: {
      timing: 'tonight',
      tone: 'urgent',
      urgency: 'high',
      length: 'short',
      ctaHint: 'Book tonight',
      contextHint: 'Tonight only - limited availability',
    },
  },
  {
    id: 'valentines',
    label: "Valentine's",
    emoji: '❤️',
    description: 'Romantic seasonal',
    defaults: {
      timing: 'valentines',
      tone: 'romantic',
      urgency: 'medium',
      length: 'medium',
      ctaHint: 'Reserve your romantic evening',
      contextHint: "Valentine's Day special",
    },
  },
  {
    id: 'lunch_offer',
    label: 'Lunch offer',
    emoji: '☀️',
    description: 'Midday deal',
    defaults: {
      timing: 'lunch',
      tone: 'casual',
      urgency: 'medium',
      length: 'short',
      ctaHint: 'Book your lunch',
      contextHint: 'Lunch special - available weekdays',
    },
  },
  {
    id: 'weekend_brunch',
    label: 'Weekend brunch',
    emoji: '🥂',
    description: 'Brunch promotion',
    defaults: {
      timing: 'weekend',
      tone: 'relaxed',
      urgency: 'low',
      length: 'medium',
      ctaHint: 'Reserve your table',
      contextHint: 'Weekend brunch special',
    },
  },
  {
    id: 'happy_hour',
    label: 'Happy hour',
    emoji: '🍸',
    description: 'After-work drinks',
    defaults: {
      timing: 'evening',
      tone: 'fun',
      urgency: 'medium',
      length: 'short',
      ctaHint: 'Join us for happy hour',
      contextHint: 'Happy hour - weekdays 5-7pm',
    },
  },
];

// Module configurations
export const moduleConfigs = {
  email: {
    id: 'email' as CopyModule,
    title: 'Email Campaigns',
    description: 'Subject lines, preview text & body copy',
    icon: Mail,
    color: 'text-blue-400',
    stepOneLabel: "What's this email for?",
  },
  blog: {
    id: 'blog' as CopyModule,
    title: 'Blog Posts',
    description: 'SEO-optimized articles with outlines',
    icon: FileText,
    color: 'text-green-400',
    stepOneLabel: 'What should this article do?',
  },
  ad_copy: {
    id: 'ad_copy' as CopyModule,
    title: 'Ad Copy',
    description: 'Headlines, primary text & CTAs',
    icon: Megaphone,
    color: 'text-orange-400',
    stepOneLabel: "What's the ad trying to achieve?",
  },
  sms_push: {
    id: 'sms_push' as CopyModule,
    title: 'SMS / Push',
    description: 'Short messages with character counts',
    icon: MessageSquare,
    color: 'text-purple-400',
    stepOneLabel: "What's this message for?",
  },
};

// Platform options per module
export const platformOptions: Record<CopyModule, string[]> = {
  email: ['Newsletter', 'Promotional Email', 'Welcome Email', 'Re-engagement'],
  blog: ['Website Blog', 'Medium', 'LinkedIn Article', 'Guest Post'],
  ad_copy: ['Meta (Facebook/Instagram)', 'Google Ads', 'TikTok', 'Twitter/X', 'LinkedIn'],
  sms_push: ['SMS', 'Push Notification', 'WhatsApp'],
};

// Audience options
export const audienceOptions = [
  { value: 'general', label: 'General audience' },
  { value: 'regulars', label: 'Regular customers' },
  { value: 'new_guests', label: 'New guests' },
  { value: 'young_professionals', label: 'Young professionals' },
  { value: 'families', label: 'Families' },
  { value: 'couples', label: 'Couples' },
  { value: 'business', label: 'Business diners' },
  { value: 'tourists', label: 'Tourists & visitors' },
  { value: 'local_foodies', label: 'Local foodies' },
  { value: 'vip', label: 'VIP / Loyalty members' },
];

// Tone options
export const toneOptions = [
  { value: 'casual', label: 'Casual & Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'premium', label: 'Sophisticated & Exclusive' },
  { value: 'playful', label: 'Playful & Fun' },
  { value: 'urgent', label: 'Urgent & Direct' },
  { value: 'warm', label: 'Warm & Welcoming' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'educational', label: 'Educational' },
];
