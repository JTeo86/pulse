export type VenueTone = 'premium' | 'casual' | 'energetic';
export type VenueVibe = 'dark_intimate' | 'bright_clean' | 'lively_busy';
export type VenueAudience = 'couples' | 'groups' | 'mixed';

export interface ResolvedVenueStyle {
  cuisine: string;
  tone: VenueTone;
  vibe: VenueVibe;
  audience: VenueAudience;
  source: 'selected' | 'inferred';
}

const toneByLegacy: Record<string, VenueTone> = {
  luxury: 'premium',
  upscale: 'premium',
  premium: 'premium',
  casual: 'casual',
  energetic: 'energetic',
};

const vibeByLegacy: Record<string, VenueVibe> = {
  dark: 'dark_intimate',
  moody: 'dark_intimate',
  intimate: 'dark_intimate',
  bright: 'bright_clean',
  clean: 'bright_clean',
  lively: 'lively_busy',
  busy: 'lively_busy',
};

export function resolveVenueStyle(input: {
  profile?: Record<string, any> | null;
  brandKit?: Record<string, any> | null;
  recentAssets?: Array<Record<string, any>>;
  recentContent?: Array<Record<string, any>>;
  venue?: Record<string, any> | null;
}): ResolvedVenueStyle {
  const profile = input.profile || {};
  const explicitTone = normalizeTone(profile.venue_tone);
  const explicitVibe = normalizeVibe(profile.lighting_mood || profile.style_summary);
  const explicitAudience = normalizeAudience(profile.target_audience);
  const explicitCuisine = clean(profile.cuisine_type);

  if (explicitTone && explicitVibe && explicitAudience && explicitCuisine) {
    return {
      cuisine: explicitCuisine,
      tone: explicitTone,
      vibe: explicitVibe,
      audience: explicitAudience,
      source: 'selected',
    };
  }

  const corpus = [
    profile.brand_summary,
    profile.style_summary,
    profile.key_selling_points,
    profile.target_audience,
    input.brandKit?.preset,
    input.brandKit?.rules_text,
    input.venue?.name,
    ...(input.recentAssets || []).map((asset) => `${asset?.title || ''} ${JSON.stringify(asset?.metadata || {})}`),
    ...(input.recentContent || []).map((item) => `${item?.title || ''} ${item?.caption_draft || ''} ${item?.caption_final || ''}`),
  ].filter(Boolean).join(' ').toLowerCase();

  const includesAny = (terms: string[]) => terms.some((term) => corpus.includes(term));

  const inferredTone: VenueTone = explicitTone
    || (includesAny(['fine dining', 'chef', 'tasting', 'luxury', 'premium', 'intimate']) ? 'premium'
      : includesAny(['party', 'nightlife', 'dj', 'lively', 'music', 'festival', 'crowd']) ? 'energetic'
        : 'casual');

  const inferredVibe: VenueVibe = explicitVibe
    || (includesAny(['moody', 'dim', 'candle', 'dark', 'speakeasy']) ? 'dark_intimate'
      : includesAny(['crowd', 'live music', 'busy bar', 'celebration', 'neon']) ? 'lively_busy'
        : 'bright_clean');

  const inferredAudience: VenueAudience = explicitAudience
    || (includesAny(['date night', 'romantic', 'anniversary', 'couples']) ? 'couples'
      : includesAny(['friends', 'group', 'party', 'family style', 'celebration']) ? 'groups'
        : 'mixed');

  const cuisine = explicitCuisine || inferCuisine(corpus);

  return {
    cuisine,
    tone: inferredTone,
    vibe: inferredVibe,
    audience: inferredAudience,
    source: 'inferred',
  };
}

function inferCuisine(corpus: string): string {
  if (corpus.includes('sushi') || corpus.includes('ramen') || corpus.includes('japanese')) return 'japanese';
  if (corpus.includes('pasta') || corpus.includes('pizza') || corpus.includes('italian')) return 'italian';
  if (corpus.includes('taco') || corpus.includes('mexican')) return 'mexican';
  if (corpus.includes('curry') || corpus.includes('indian')) return 'indian';
  if (corpus.includes('steak')) return 'steakhouse';
  if (corpus.includes('brunch') || corpus.includes('cafe') || corpus.includes('coffee')) return 'cafe';
  if (corpus.includes('bar') || corpus.includes('cocktail')) return 'bar';
  if (corpus.includes('seafood') || corpus.includes('oyster')) return 'seafood';
  return 'restaurant';
}

function normalizeTone(raw: unknown): VenueTone | null {
  const v = clean(raw).toLowerCase();
  if (!v) return null;
  if (v in toneByLegacy) return toneByLegacy[v];
  if (v.includes('premium') || v.includes('luxury') || v.includes('refined')) return 'premium';
  if (v.includes('energetic') || v.includes('lively') || v.includes('bold')) return 'energetic';
  if (v.includes('casual') || v.includes('friendly') || v.includes('warm')) return 'casual';
  return null;
}

function normalizeVibe(raw: unknown): VenueVibe | null {
  const v = clean(raw).toLowerCase();
  if (!v) return null;
  if (v in vibeByLegacy) return vibeByLegacy[v];
  if (v.includes('dark') || v.includes('intimate') || v.includes('moody')) return 'dark_intimate';
  if (v.includes('lively') || v.includes('busy') || v.includes('neon') || v.includes('crowd')) return 'lively_busy';
  if (v.includes('bright') || v.includes('clean') || v.includes('airy')) return 'bright_clean';
  return null;
}

function normalizeAudience(raw: unknown): VenueAudience | null {
  const v = clean(raw).toLowerCase();
  if (!v) return null;
  if (v.includes('couple') || v.includes('date') || v.includes('romantic')) return 'couples';
  if (v.includes('group') || v.includes('party') || v.includes('friends') || v.includes('family')) return 'groups';
  if (v.includes('mixed')) return 'mixed';
  return null;
}

function clean(value: unknown): string {
  return String(value || '').trim();
}

export function buildImageStyleDirectives(style: ResolvedVenueStyle): string[] {
  const vibeDirective = style.vibe === 'dark_intimate'
    ? 'Lighting mood: dark and intimate, soft low-key contrast.'
    : style.vibe === 'lively_busy'
      ? 'Lighting mood: lively and busy, dynamic but believable restaurant energy.'
      : 'Lighting mood: bright and clean, airy and natural.';

  const toneDirective = style.tone === 'premium'
    ? 'Tone: premium and refined, with restrained styling.'
    : style.tone === 'energetic'
      ? 'Tone: energetic and social, without becoming gimmicky.'
      : 'Tone: casual and welcoming, natural and approachable.';

  const audienceDirective = style.audience === 'couples'
    ? 'Audience emphasis: intimate dining moments for couples.'
    : style.audience === 'groups'
      ? 'Audience emphasis: shareable table moments suited to groups.'
      : 'Audience emphasis: broadly appealing to mixed dining occasions.';

  return [
    `Cuisine context: ${style.cuisine}.`,
    toneDirective,
    vibeDirective,
    audienceDirective,
    'Keep dish authenticity strict: do not alter ingredients, plating identity, or portion.',
    'Do not over-style. Match realistic venue lighting and mood.',
  ];
}
