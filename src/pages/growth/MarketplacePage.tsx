import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Compass, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

function parseBool(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return value.toLowerCase() === 'true';
}

function parseStage(value: string | undefined, fallback = 1) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(3, Math.trunc(parsed)));
}

export default function MarketplacePage() {
  const { currentVenue } = useVenue();
  const [query, setQuery] = useState('');

  const { data: venues, isLoading } = useQuery({
    queryKey: ['referral-marketplace-venues', currentVenue?.id],
    queryFn: async () => {
      const [{ data: settingsRows, error: settingsError }, { data, error }] = await Promise.all([
        supabase
          .from('platform_settings')
          .select('key, value')
          .in('key', ['referral_system_enabled', 'referral_stage', 'referral_beta_mode']),
        supabase
          .from('venues')
          .select('id, name, city, country_code, referral_enabled, referral_beta_access, referral_stage_override')
          .eq('referral_enabled', true)
          .order('name'),
      ]);

      if (settingsError) throw settingsError;
      if (error) throw error;

      const map = new Map((settingsRows ?? []).map((row) => [row.key, row.value ?? '']));
      const globalEnabled = parseBool(map.get('referral_system_enabled'), false);
      const globalStage = parseStage(map.get('referral_stage'), 1);
      const betaMode = parseBool(map.get('referral_beta_mode'), true);

      if (!globalEnabled) return [];

      return (data ?? []).filter((venue) => {
        if (venue.id === currentVenue?.id) return false;
        if (betaMode && !venue.referral_beta_access) return false;
        const effectiveStage = venue.referral_stage_override ?? globalStage;
        return effectiveStage >= 3;
      });
    },
    enabled: !!currentVenue,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return venues ?? [];

    return (venues ?? []).filter((venue) => {
      const city = venue.city?.toLowerCase() ?? '';
      return venue.name.toLowerCase().includes(needle) || city.includes(needle);
    });
  }, [query, venues]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Partner Marketplace"
        description="Browse active partner-ready venues and discover new collaboration opportunities."
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search venues"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-10">Loading marketplace…</div>
      ) : !filtered.length ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            No venues found yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((venue) => (
            <Card key={venue.id}>
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
                <CardDescription>
                  {venue.city ? `${venue.city} • ${venue.country_code}` : venue.country_code}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
                <Compass className="w-4 h-4" />
                Open for partner discovery
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}
