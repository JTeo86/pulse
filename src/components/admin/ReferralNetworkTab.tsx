import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Building2, Network, Search, Shield } from 'lucide-react';

type SettingsMap = Record<string, string>;

function parseBool(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return value.toLowerCase() === 'true';
}

function parseStage(value: string | undefined, fallback = 1) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(3, Math.trunc(parsed)));
}

export default function ReferralNetworkTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: settings, isLoading: settingsLoading } = useQuery<SettingsMap>({
    queryKey: ['referral-admin-platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['referral_system_enabled', 'referral_stage', 'referral_stripe_enabled']);
      if (error) throw error;

      const map: SettingsMap = {};
      (data ?? []).forEach((row) => {
        map[row.key] = row.value ?? '';
      });
      return map;
    },
  });

  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ['referral-admin-venues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, city, referral_enabled, referral_stage_override')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['referral-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['partner-referral-platform-settings'] });
      toast.success('Referral rollout updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateVenue = useMutation({
    mutationFn: async ({
      venueId,
      referralEnabled,
      referralStageOverride,
    }: {
      venueId: string;
      referralEnabled?: boolean;
      referralStageOverride?: number | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (referralEnabled !== undefined) updates.referral_enabled = referralEnabled;
      if (referralStageOverride !== undefined) updates.referral_stage_override = referralStageOverride;

      const { error } = await supabase.from('venues').update(updates).eq('id', venueId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-venues'] });
      qc.invalidateQueries({ queryKey: ['referral-platform-settings'] });
      toast.success('Venue rollout updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const referralEnabled = parseBool(settings?.referral_system_enabled, false);
  const referralStage = parseStage(settings?.referral_stage, 1);
  const stripeEnabled = parseBool(settings?.referral_stripe_enabled, false);

  const filteredVenues = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return venues ?? [];

    return (venues ?? []).filter((venue) => {
      const city = venue.city?.toLowerCase() ?? '';
      return venue.name.toLowerCase().includes(needle) || city.includes(needle);
    });
  }, [search, venues]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
        <div className="flex items-start gap-3">
          <Network className="w-5 h-5 text-accent mt-0.5" />
          <div>
            <h4 className="font-medium text-sm">Referral rollout controls</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Control global launch, stage progression, and per-venue access. Keep rollout private while testing.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Global Controls
          </CardTitle>
          <CardDescription>Turn referrals on or off for the platform and set the active rollout stage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Referral system enabled</p>
                  <p className="text-xs text-muted-foreground">Master kill switch for all referral surfaces.</p>
                </div>
                <Switch
                  checked={referralEnabled}
                  onCheckedChange={(checked) => upsertSetting.mutate({ key: 'referral_system_enabled', value: String(checked) })}
                  disabled={upsertSetting.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Default referral stage</Label>
                <Select
                  value={String(referralStage)}
                  onValueChange={(value) => upsertSetting.mutate({ key: 'referral_stage', value })}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Private referrals</SelectItem>
                    <SelectItem value="2">Network expansion</SelectItem>
                    <SelectItem value="3">Marketplace</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Stripe payouts enabled</p>
                  <p className="text-xs text-muted-foreground">Controls automated payout mode for referral commissions.</p>
                </div>
                <Switch
                  checked={stripeEnabled}
                  onCheckedChange={(checked) => upsertSetting.mutate({ key: 'referral_stripe_enabled', value: String(checked) })}
                  disabled={upsertSetting.isPending}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Venue Access Overrides
          </CardTitle>
          <CardDescription>
            Assign venues to beta rollout, enable referrals per venue, and optionally override stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Search venues"
            />
          </div>

          {venuesLoading ? (
            <p className="text-sm text-muted-foreground">Loading venues…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Stage Override</TableHead>
                    <TableHead>Effective Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVenues.map((venue) => {
                    const effectiveStage = venue.referral_stage_override ?? referralStage;
                    return (
                      <TableRow key={venue.id}>
                        <TableCell>
                          <p className="font-medium">{venue.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{venue.id}</p>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={venue.referral_enabled}
                            onCheckedChange={(checked) => updateVenue.mutate({ venueId: venue.id, referralEnabled: checked })}
                            disabled={updateVenue.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={venue.referral_stage_override ? String(venue.referral_stage_override) : 'default'}
                            onValueChange={(value) => updateVenue.mutate({
                              venueId: venue.id,
                              referralStageOverride: value === 'default' ? null : Number(value),
                            })}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Use global ({referralStage})</SelectItem>
                              <SelectItem value="1">Private referrals</SelectItem>
                              <SelectItem value="2">Network expansion</SelectItem>
                              <SelectItem value="3">Marketplace</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={referralEnabled && venue.referral_enabled ? 'default' : 'secondary'}>
                            {referralEnabled && venue.referral_enabled ? `Active (stage ${effectiveStage})` : 'Hidden'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
