export type AssetTagCategory = {
  key: string;
  label: string;
  tags: readonly string[];
};

export const ASSET_TAG_CATEGORIES: readonly AssetTagCategory[] = [
  {
    key: 'subject',
    label: 'Subject',
    tags: ['dish', 'drink', 'dessert', 'interior', 'exterior', 'team', 'chef/prep', 'event'],
  },
  {
    key: 'style_framing',
    label: 'Style & framing',
    tags: ['hero shot', 'close-up', 'wide shot', 'lifestyle', 'detail shot'],
  },
] as const;

export const PREDEFINED_ASSET_TAGS: readonly string[] = ASSET_TAG_CATEGORIES.flatMap((category) => category.tags);

const PREDEFINED_TAG_SET = new Set(PREDEFINED_ASSET_TAGS);

export function isPredefinedAssetTag(tag: string): boolean {
  return PREDEFINED_TAG_SET.has(tag);
}

export function normalizeAssetTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const next: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') {
      continue;
    }

    const value = raw.trim();
    if (!value || next.includes(value)) {
      continue;
    }

    next.push(value);
  }

  return next;
}

export function splitAssetTags(tags: unknown): { known: string[]; legacy: string[] } {
  const normalized = normalizeAssetTags(tags);

  return {
    known: normalized.filter((tag) => isPredefinedAssetTag(tag)),
    legacy: normalized.filter((tag) => !isPredefinedAssetTag(tag)),
  };
}
