import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupPage from './Setup';

const {
  refreshVenuesMock,
  toastMock,
  invokeMock,
  uploadMock,
  removeMock,
} = vi.hoisted(() => ({
  refreshVenuesMock: vi.fn(async () => {}),
  toastMock: vi.fn(),
  invokeMock: vi.fn(),
  uploadMock: vi.fn(async () => ({ error: null })),
  removeMock: vi.fn(async () => ({ error: null })),
}));

type MockDb = {
  profile: Record<string, unknown> | null;
  brandKit: Record<string, unknown> | null;
  autopilot: Record<string, unknown> | null;
  assets: Array<Record<string, unknown>>;
};

let db: MockDb;
let mutationLog: {
  venues: Array<Record<string, unknown>>;
  profile: Array<Record<string, unknown>>;
  brandKit: Array<Record<string, unknown>>;
  autopilot: Array<Record<string, unknown>>;
} = {
  venues: [],
  profile: [],
  brandKit: [],
  autopilot: [],
};

vi.mock('@/lib/venue-context', () => ({
  useVenue: () => ({
    currentVenue: {
      id: 'venue-1',
      name: 'Pulse Bistro',
      city: 'London',
      website_url: 'https://pulse.example',
      instagram_handle: 'pulsebistro',
    },
    refreshVenues: refreshVenuesMock,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/hooks/use-resolved-media', () => ({
  resolveAssetMediaUrl: vi.fn(async ({
    public_url,
    thumbnail_url,
    storage_path,
  }: {
    public_url?: string | null;
    thumbnail_url?: string | null;
    storage_path?: string | null;
  }) => public_url || thumbnail_url || storage_path || null),
}));

vi.mock('@/integrations/supabase/client', () => {
  type QueryBuilder = {
    eq: (field: string, value: string) => QueryBuilder;
    in: (field: string, values: string[]) => QueryBuilder;
    order: (field: string, options?: { ascending?: boolean }) => Promise<{ data: Array<Record<string, unknown>>; error: null }>;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
    single: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
    limit: (count: number) => Promise<{ data: Array<Record<string, unknown>>; error: null }>;
  };

  const createSelectQuery = (table: string) => {
    const query = {} as QueryBuilder;
    query.eq = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.order = vi.fn(async () => ({ data: getRows(table), error: null }));
    query.maybeSingle = vi.fn(async () => ({ data: getSingle(table), error: null }));
    query.single = vi.fn(async () => ({ data: getSingle(table), error: null }));
    query.limit = vi.fn(async () => ({ data: getRows(table), error: null }));
    return query;
  };

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => createSelectQuery(table)),
    update: vi.fn((payload: Record<string, unknown>) => ({
      eq: vi.fn(async () => {
        if (table === 'venues') mutationLog.venues.push(payload);
        return { data: null, error: null };
      }),
    })),
    upsert: vi.fn(async (payload: Record<string, unknown>) => {
      if (table === 'venue_style_profiles') mutationLog.profile.push(payload);
      if (table === 'brand_kits') mutationLog.brandKit.push(payload);
      if (table === 'autopilot_settings') mutationLog.autopilot.push(payload);
      return { data: null, error: null };
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      if (table === 'content_assets') {
        db.assets.unshift({
          id: `asset-${db.assets.length + 1}`,
          asset_type: payload.asset_type,
          title: payload.title,
          public_url: payload.public_url,
          thumbnail_url: null,
          storage_path: payload.storage_path,
          storage_bucket: payload.storage_bucket,
          metadata: payload.metadata,
          created_at: new Date().toISOString(),
        });
      }
      return { data: null, error: null };
    }),
    delete: vi.fn(() => ({
      eq: vi.fn(async (field: string, id: string) => {
        if (table === 'content_assets' && field === 'id') {
          db.assets = db.assets.filter((asset) => asset.id !== id);
        }
        return { error: null };
      }),
    })),
  }));

  const getSingle = (table: string): Record<string, unknown> | null => {
    if (table === 'venue_style_profiles') return db.profile;
    if (table === 'brand_kits') return db.brandKit;
    if (table === 'autopilot_settings') return db.autopilot;
    return null;
  };

  const getRows = (table: string): Array<Record<string, unknown>> => {
    if (table === 'content_assets') return db.assets;
    return [];
  };

  return {
    supabase: {
      from,
      functions: {
        invoke: invokeMock,
      },
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          remove: removeMock,
        })),
      },
    },
  };
});

function renderSetupPage(initialEntry = '/setup') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SetupPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db = {
    profile: {
      cuisine_type: 'italian',
      venue_tone: 'casual',
      lighting_mood: 'bright_clean',
      target_audience: 'mixed',
      brand_summary: 'Neighbourhood Italian spot.',
      style_summary: 'Natural daylight and clean plating.',
      key_selling_points: 'Fresh pasta and warm service.',
    },
    brandKit: {
      rules_text: JSON.stringify({
        voiceStyle: 'Warm, direct, neighbourly.',
        visualStyle: 'Natural, bright, plated simply.',
        suggestedContentAngles: 'Daily pasta, regulars, wine moments.',
      }),
    },
    autopilot: {
      mode: 'conservative',
      frequency: '3x_week',
      approval_mode: 'require_approval',
      require_asset_for_runs: true,
      allow_copy_only_fallback: false,
    },
    assets: [],
  };
  mutationLog = { venues: [], profile: [], brandKit: [], autopilot: [] };
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({
    data: {
      website_url: 'https://fresh.example',
      suggestions: {
        venueName: 'Fresh Pasta House',
        cuisineType: 'italian',
        location: 'Shoreditch',
        tone: 'premium',
        audience: 'couples',
        positioning: 'Modern pasta bar for date nights.',
        keySellingPoints: 'Fresh pasta, open kitchen, great wine.',
        suggestedContentAngles: 'Chef moments, pasta close-ups, cosy evenings.',
      },
      confidence: 'high',
      warnings: [],
    },
    error: null,
  });
  toastMock.mockReset();
  refreshVenuesMock.mockClear();
  uploadMock.mockClear();
  removeMock.mockClear();
});

describe('SetupPage', () => {
  it('marks profile complete on load when the visible required fields are already saved', async () => {
    renderSetupPage('/setup');

    expect(await screen.findByRole('button', { name: /Profile Complete/i })).toBeInTheDocument();
    expect(screen.getByText('Core fields ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmed/i })).toBeInTheDocument();
  });

  it('maps old tab links into the new guided steps and preserves onboarding copy', async () => {
    renderSetupPage('/setup?onboarding=1&tab=assets');

    await screen.findByText('Reusable photos');
    expect(screen.getByText(/Complete these four steps once/i)).toBeInTheDocument();
  });

  it('generates a website draft and applies it into the single profile editor', async () => {
    renderSetupPage('/setup');

    await screen.findByDisplayValue('Pulse Bistro');
    fireEvent.click(screen.getByRole('button', { name: /Generate draft/i }));

    await screen.findByText('Draft ready');
    fireEvent.click(screen.getByRole('button', { name: /Use this draft/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Fresh Pasta House')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Shoreditch')).toBeInTheDocument();
    });
  });

  it('resets profile confirmation when a core field changes after confirmation', async () => {
    renderSetupPage('/setup');

    await screen.findByDisplayValue('Pulse Bistro');
    expect(screen.getByRole('button', { name: /Confirmed/i })).toBeInTheDocument();

    const venueNameInput = screen.getByDisplayValue('Pulse Bistro');
    fireEvent.change(venueNameInput, { target: { value: 'Pulse Bistro Updated' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm profile/i })).toBeInTheDocument();
      expect(screen.getByText(/Confirm once more to lock this in/i)).toBeInTheDocument();
    });
  });

  it('supports skipping photos and reflects that state in the photos step', async () => {
    renderSetupPage('/setup?tab=assets');

    await screen.findByText('Reusable photos');
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));

    expect(await screen.findByText(/Photos skipped for now/i)).toBeInTheDocument();
  });

  it('shows the calmer photos upload-first layout when assets exist', async () => {
    db.assets = [
      {
        id: 'asset-1',
        asset_type: 'image',
        title: 'Dining room',
        public_url: 'https://example.com/photo.jpg',
        thumbnail_url: null,
        storage_path: null,
        storage_bucket: null,
        metadata: { tags: ['interior', 'dish'], visual_type: 'interior' },
        created_at: new Date().toISOString(),
      },
    ];

    renderSetupPage('/setup?tab=assets');

    expect(await screen.findByText('Ready for reuse')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skip for now/i })).not.toBeInTheDocument();
  });

  it('keeps profile incomplete if a required visible field is missing on load', async () => {
    db.profile = {
      ...db.profile,
      brand_summary: '',
    };

    renderSetupPage('/setup');

    expect(await screen.findByRole('button', { name: /Profile Review and confirm the core profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm profile/i })).toBeDisabled();
  });

  it('saves the same data model and maps the Active preset to creative daily auto-schedule', async () => {
    renderSetupPage('/setup?tab=automation');

    await screen.findByText('How active should Pulse be?');
    fireEvent.click(screen.getByRole('button', { name: /^Active/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save setup/i }));

    await waitFor(() => {
      expect(refreshVenuesMock).toHaveBeenCalled();
      expect(mutationLog.venues.at(-1)).toEqual(expect.objectContaining({
        name: 'Pulse Bistro',
        city: 'London',
        website_url: 'https://pulse.example',
        instagram_handle: 'pulsebistro',
      }));
      expect(mutationLog.profile.at(-1)).toEqual(expect.objectContaining({
        cuisine_type: 'italian',
        venue_tone: 'casual',
        target_audience: 'mixed',
      }));
      expect(mutationLog.brandKit.at(-1)).toEqual(expect.objectContaining({
        venue_id: 'venue-1',
      }));
      expect(mutationLog.autopilot.at(-1)).toEqual(expect.objectContaining({
        venue_id: 'venue-1',
        mode: 'creative',
        frequency: 'daily',
        approval_mode: 'auto_schedule',
        is_enabled: true,
      }));
    });
  });
});
