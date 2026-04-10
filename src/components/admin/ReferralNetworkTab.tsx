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
import { Building2, Network, Search, Shield, Rocket, Users, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type SettingsMap = Record<string, string>;
type StageValue = 1 | 2 | 3;

type VenueRolloutRow = {
  id: string;
  name: string;
  city: string | null;
  referral_enabled: boolean;
  referral_beta_access: boolean;
  referral_stage_override: number | null;
  referral_rollout_changed_at: string | null;
  referral_rollout_changed_by: string | null;
};

type PartnerRolloutRow = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  partner_referral_enabled: boolean;
  partner_beta_access: boolean;
  partner_stage_override: number | null;
  partner_rollout_changed_at: string | null;
  partner_rollout_changed_by: string | null;
  linked_venues_count: number;
};

type ConfirmState = {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
} | null;

function parseBool(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return value.toLowerCase() === 'true';
}

function parseStage(value: string | undefined, fallback = 1): StageValue {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback as StageValue;
  return Math.max(1, Math.min(3, Math.trunc(parsed))) as StageValue;
}

function formatActor(actor: string | null) {
  if (!actor) return '—';
  return `${actor.slice(0, 8)}…`;
}

export default function ReferralNetworkTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(new Set());
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<SettingsMap>({
    queryKey: ['referral-admin-platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['referral_system_enabled', 'referral_stage', 'referral_beta_mode', 'referral_stripe_enabled']);
      if (error) throw error;

      const map: SettingsMap = {};
      (data ?? []).forEach((row) => {
        map[row.key] = row.value ?? '';
      });
      return map;
    },
  });

  const { data: venues, isLoading: venuesLoading } = useQuery<VenueRolloutRow[]>({
    queryKey: ['referral-admin-venues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, city, referral_enabled, referral_beta_access, referral_stage_override, referral_rollout_changed_at, referral_rollout_changed_by')
        .order('name');
      if (error) throw error;
      return (data ?? []) as VenueRolloutRow[];
    },
  });

  const { data: partners, isLoading: partnersLoading } = useQuery<PartnerRolloutRow[]>({
    queryKey: ['referral-admin-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrers')
        .select('id, full_name, email, status, partner_referral_enabled, partner_beta_access, partner_stage_override, partner_rollout_changed_at, partner_rollout_changed_by')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;

      const rows = (data ?? []) as Omit<PartnerRolloutRow, 'linked_venues_count'>[];
      if (!rows.length) return [];

      const referrerIds = rows.map((row) => row.id);
      const { data: links, error: linksError } = await supabase
        .from('referral_links')
        .select('referrer_id, venue_id')
        .in('referrer_id', referrerIds);
      if (linksError) throw linksError;

      const linkedVenueMap = new Map<string, Set<string>>();
      (links ?? []).forEach((link) => {
        if (!link.referrer_id || !link.venue_id) return;
        if (!linkedVenueMap.has(link.referrer_id)) linkedVenueMap.set(link.referrer_id, new Set());
        linkedVenueMap.get(link.referrer_id)?.add(link.venue_id);
      });

      return rows.map((row) => ({
        ...row,
        linked_venues_count: linkedVenueMap.get(row.id)?.size ?? 0,
      }));
    },
  });

  const { data: openDisputes } = useQuery({
    queryKey: ['referral-admin-open-disputes'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('commission_disputes')
        .select('id, dispute_type, reason, status, created_at, commissions(id, venue_id), payout_periods(month)')
        .in('status', ['open', 'escalated'])
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: adjustmentSignals } = useQuery({
    queryKey: ['referral-admin-adjustment-signals'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('commission_adjustments')
        .select('id, payout_period_id, adjustment_type, previous_amount, new_amount, commissions(venue_id)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const venueMap = new Map<string, { downward: number; total: number }>();
      (data ?? []).forEach((row: any) => {
        const venueId = row?.commissions?.venue_id;
        if (!venueId) return;
        const entry = venueMap.get(venueId) ?? { downward: 0, total: 0 };
        entry.total += 1;
        if (Number(row.new_amount || 0) < Number(row.previous_amount || 0)) entry.downward += 1;
        venueMap.set(venueId, entry);
      });
      return Array.from(venueMap.entries())
        .map(([venueId, value]) => ({ venueId, ...value }))
        .filter((row) => row.downward >= 3)
        .sort((a, b) => b.downward - a.downward)
        .slice(0, 10);
    },
  });

  const resolveDispute = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'resolved' | 'rejected' | 'escalated' }) => {
      const payload: any = { status };
      if (status !== 'escalated') {
        payload.resolved_at = new Date().toISOString();
        payload.resolution_note = `Set to ${status} by admin`;
      }
      const { error } = await (supabase as any).from('commission_disputes').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-open-disputes'] });
      toast.success('Dispute updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const logAuditEvent = async ({
    eventScope,
    eventType,
    venueId,
    partnerId,
    payload,
  }: {
    eventScope: 'global' | 'venue' | 'partner' | 'bulk';
    eventType: string;
    venueId?: string | null;
    partnerId?: string | null;
    payload: Record<string, unknown>;
  }) => {
    const { data: authData } = await supabase.auth.getUser();
    const actorUserId = authData.user?.id ?? null;

    const { error } = await supabase.from('referral_rollout_audit_events').insert({
      event_scope: eventScope,
      event_type: eventType,
      venue_id: venueId ?? null,
      partner_id: partnerId ?? null,
      actor_user_id: actorUserId,
      event_payload: payload,
    });

    if (error) throw error;
    return actorUserId;
  };

  const upsertSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;

      await logAuditEvent({
        eventScope: 'global',
        eventType: `global_setting_${key}`,
        payload: { key, value },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['referral-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['partner-referral-platform-settings'] });
      toast.success('Global referral rollout updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateVenue = useMutation({
    mutationFn: async ({
      venueId,
      referralEnabled,
      referralBetaAccess,
      referralStageOverride,
      eventType,
    }: {
      venueId: string;
      referralEnabled?: boolean;
      referralBetaAccess?: boolean;
      referralStageOverride?: number | null;
      eventType: string;
    }) => {
      const actorUserId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const updates: Record<string, unknown> = {
        referral_rollout_changed_at: new Date().toISOString(),
        referral_rollout_changed_by: actorUserId,
      };
      if (referralEnabled !== undefined) updates.referral_enabled = referralEnabled;
      if (referralBetaAccess !== undefined) updates.referral_beta_access = referralBetaAccess;
      if (referralStageOverride !== undefined) updates.referral_stage_override = referralStageOverride;

      const { error } = await supabase.from('venues').update(updates).eq('id', venueId);
      if (error) throw error;

      await logAuditEvent({
        eventScope: 'venue',
        eventType,
        venueId,
        payload: {
          referral_enabled: referralEnabled,
          referral_beta_access: referralBetaAccess,
          referral_stage_override: referralStageOverride,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-venues'] });
      qc.invalidateQueries({ queryKey: ['referral-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['partner-referral-platform-settings'] });
      toast.success('Venue rollout updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updatePartner = useMutation({
    mutationFn: async ({
      partnerId,
      partnerReferralEnabled,
      partnerBetaAccess,
      partnerStageOverride,
      eventType,
    }: {
      partnerId: string;
      partnerReferralEnabled?: boolean;
      partnerBetaAccess?: boolean;
      partnerStageOverride?: number | null;
      eventType: string;
    }) => {
      const actorUserId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const updates: Record<string, unknown> = {
        partner_rollout_changed_at: new Date().toISOString(),
        partner_rollout_changed_by: actorUserId,
      };
      if (partnerReferralEnabled !== undefined) updates.partner_referral_enabled = partnerReferralEnabled;
      if (partnerBetaAccess !== undefined) updates.partner_beta_access = partnerBetaAccess;
      if (partnerStageOverride !== undefined) updates.partner_stage_override = partnerStageOverride;

      const { error } = await supabase.from('referrers').update(updates).eq('id', partnerId);
      if (error) throw error;

      await logAuditEvent({
        eventScope: 'partner',
        eventType,
        partnerId,
        payload: {
          partner_referral_enabled: partnerReferralEnabled,
          partner_beta_access: partnerBetaAccess,
          partner_stage_override: partnerStageOverride,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-partners'] });
      qc.invalidateQueries({ queryKey: ['partner-referrer-profile'] });
      toast.success('Partner rollout updated');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runBulkAction = useMutation({
    mutationFn: async ({ action }: { action: 'enable-stage-1-beta' | 'move-beta-stage-2' | 'disable-global' }) => {
      if (action === 'disable-global') {
        const { error } = await supabase
          .from('platform_settings')
          .upsert({ key: 'referral_system_enabled', value: 'false', updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;

        await logAuditEvent({
          eventScope: 'bulk',
          eventType: 'bulk_disable_referral_system_globally',
          payload: { action },
        });
        return;
      }

      const ids = Array.from(selectedVenueIds);
      if (!ids.length) return;

      const actorUserId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const nowIso = new Date().toISOString();
      const updates = action === 'enable-stage-1-beta'
        ? {
            referral_enabled: true,
            referral_beta_access: true,
            referral_stage_override: 1,
            referral_rollout_changed_at: nowIso,
            referral_rollout_changed_by: actorUserId,
          }
        : {
            referral_beta_access: true,
            referral_stage_override: 2,
            referral_rollout_changed_at: nowIso,
            referral_rollout_changed_by: actorUserId,
          };

      const { error } = await supabase.from('venues').update(updates).in('id', ids);
      if (error) throw error;

      await logAuditEvent({
        eventScope: 'bulk',
        eventType: action,
        payload: { action, venue_ids: ids, count: ids.length },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-venues'] });
      qc.invalidateQueries({ queryKey: ['referral-admin-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['referral-platform-settings'] });
      qc.invalidateQueries({ queryKey: ['partner-referral-platform-settings'] });
      setSelectedVenueIds(new Set());
      toast.success('Rollout action completed');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const referralEnabled = parseBool(settings?.referral_system_enabled, false);
  const referralStage = parseStage(settings?.referral_stage, 1);
  const betaMode = parseBool(settings?.referral_beta_mode, true);

  const filteredVenues = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return venues ?? [];

    return (venues ?? []).filter((venue) => {
      const city = venue.city?.toLowerCase() ?? '';
      return venue.name.toLowerCase().includes(needle) || city.includes(needle);
    });
  }, [search, venues]);

  const filteredPartners = useMemo(() => {
    const needle = partnerSearch.trim().toLowerCase();
    if (!needle) return partners ?? [];
    return (partners ?? []).filter((partner) =>
      partner.full_name.toLowerCase().includes(needle) ||
      partner.email.toLowerCase().includes(needle)
    );
  }, [partnerSearch, partners]);

  const venuesWithAccessCount = useMemo(() => {
    return (venues ?? []).filter((venue) => {
      const eligibleByBeta = !betaMode || venue.referral_beta_access;
      return referralEnabled && venue.referral_enabled && eligibleByBeta;
    }).length;
  }, [venues, referralEnabled, betaMode]);

  const stageText = (stage: number) => ({
    1: 'Private referrals',
    2: 'Network expansion',
    3: 'Marketplace',
  }[stage] ?? 'Private referrals');

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedVenueIds(new Set());
      return;
    }
    setSelectedVenueIds(new Set(filteredVenues.map((venue) => venue.id)));
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Dispute & Adjustment Oversight
          </CardTitle>
          <CardDescription>
            Watch open disputes, unresolved exclusions, and unusual downward-adjustment patterns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Open/escalated disputes</p>
              <p className="font-semibold mt-1">{openDisputes?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Venues with downward-adjustment signals</p>
              <p className="font-semibold mt-1">{adjustmentSignals?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Unresolved items excluded from payout</p>
              <p className="font-semibold mt-1">{(openDisputes ?? []).filter((d: any) => d.status !== 'resolved' && d.status !== 'rejected').length}</p>
            </div>
          </div>
          <div className="space-y-2">
            {(openDisputes ?? []).slice(0, 6).map((d: any) => (
              <div key={d.id} className="rounded-md border p-3 flex flex-wrap gap-2 items-center justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{String(d.dispute_type || 'dispute').replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">{d.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => resolveDispute.mutate({ id: d.id, status: 'resolved' })}>Resolve</Button>
                  <Button size="sm" variant="outline" onClick={() => resolveDispute.mutate({ id: d.id, status: 'rejected' })}>Reject</Button>
                  <Button size="sm" variant="outline" onClick={() => resolveDispute.mutate({ id: d.id, status: 'escalated' })}>Escalate</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Global Release Status
          </CardTitle>
          <CardDescription>
            Control global availability and staged rollout behavior for referrals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {settingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Referral system</p>
                  <p className="font-medium mt-1">{referralEnabled ? 'On' : 'Off'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Global stage</p>
                  <p className="font-medium mt-1">{referralStage} · {stageText(referralStage)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Beta mode</p>
                  <p className="font-medium mt-1">{betaMode ? 'On' : 'Off'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Venues with access</p>
                  <p className="font-medium mt-1">{venuesWithAccessCount}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Master toggle</p>
                  <p className="text-xs text-muted-foreground">If off, referral module is hidden for all non-admin users.</p>
                </div>
                <Switch
                  checked={referralEnabled}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      setConfirmState({
                        title: 'Disable referrals globally?',
                        description: 'This immediately hides referrals for all venues and partner users.',
                        actionLabel: 'Disable globally',
                        onConfirm: () => upsertSetting.mutate({ key: 'referral_system_enabled', value: 'false' }),
                      });
                      return;
                    }
                    upsertSetting.mutate({ key: 'referral_system_enabled', value: 'true' });
                  }}
                  disabled={upsertSetting.isPending || runBulkAction.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Global stage</Label>
                <Select
                  value={String(referralStage)}
                  onValueChange={(value) => upsertSetting.mutate({ key: 'referral_stage', value })}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Stage 1 · Private referrals</SelectItem>
                    <SelectItem value="2">Stage 2 · Network expansion</SelectItem>
                    <SelectItem value="3">Stage 3 · Marketplace</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Beta mode</p>
                  <p className="text-xs text-muted-foreground">If on, only venues explicitly marked beta can access referrals.</p>
                </div>
                <Switch
                  checked={betaMode}
                  onCheckedChange={(checked) => upsertSetting.mutate({ key: 'referral_beta_mode', value: String(checked) })}
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
            <Users className="w-4 h-4" />
            Partner Access Control
          </CardTitle>
          <CardDescription>
            Manage partner portal access, beta assignments, and stage overrides.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
              className="pl-9"
              placeholder="Search partners"
            />
          </div>

          {partnersLoading ? (
            <p className="text-sm text-muted-foreground">Loading partners…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner name</TableHead>
                    <TableHead>Partner access</TableHead>
                    <TableHead>Beta access</TableHead>
                    <TableHead>Effective stage</TableHead>
                    <TableHead>Override active</TableHead>
                    <TableHead>Linked venues</TableHead>
                    <TableHead>Last changed at</TableHead>
                    <TableHead>Last changed by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPartners.map((partner) => {
                    const stage = partner.partner_stage_override ?? referralStage;
                    const eligibleByBeta = !betaMode || partner.partner_beta_access;
                    const hasAccess = referralEnabled && partner.partner_referral_enabled && eligibleByBeta;

                    return (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <p className="font-medium">{partner.full_name}</p>
                          <p className="text-xs text-muted-foreground">{partner.email}</p>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={partner.partner_referral_enabled}
                            onCheckedChange={(checked) => updatePartner.mutate({
                              partnerId: partner.id,
                              partnerReferralEnabled: checked,
                              eventType: checked ? 'partner_referral_enabled' : 'partner_referral_disabled',
                            })}
                            disabled={updatePartner.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={partner.partner_beta_access}
                            onCheckedChange={(checked) => updatePartner.mutate({
                              partnerId: partner.id,
                              partnerBetaAccess: checked,
                              eventType: checked ? 'partner_beta_access_granted' : 'partner_beta_access_revoked',
                            })}
                            disabled={updatePartner.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Badge variant={hasAccess ? 'default' : 'secondary'}>
                              {hasAccess ? `Stage ${stage}` : 'Hidden'}
                            </Badge>
                            <Select
                              value={partner.partner_stage_override ? String(partner.partner_stage_override) : 'default'}
                              onValueChange={(value) => updatePartner.mutate({
                                partnerId: partner.id,
                                partnerStageOverride: value === 'default' ? null : Number(value),
                                eventType: value === 'default' ? 'partner_stage_override_removed' : 'partner_stage_override_set',
                              })}
                            >
                              <SelectTrigger className="w-52">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Use global ({referralStage})</SelectItem>
                                <SelectItem value="1">Stage 1</SelectItem>
                                <SelectItem value="2">Stage 2</SelectItem>
                                <SelectItem value="3">Stage 3</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>{partner.partner_stage_override ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{partner.linked_venues_count}</TableCell>
                        <TableCell>{partner.partner_rollout_changed_at ? new Date(partner.partner_rollout_changed_at).toLocaleString() : '—'}</TableCell>
                        <TableCell>{formatActor(partner.partner_rollout_changed_by)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-4 h-4" />
            Stage Definitions
          </CardTitle>
          <CardDescription>Read-only rollout definitions for admin clarity.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="font-medium text-sm">Stage 1 · Private referrals</p>
              <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>Create offer</li>
                <li>Generate referral link</li>
                <li>Manual bill verification</li>
                <li>Commission tracking</li>
              </ul>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-sm">Stage 2 · Network expansion</p>
              <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>Invite partners</li>
                <li>Manage referrers</li>
                <li>Basic partner performance</li>
              </ul>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-sm">Stage 3 · Marketplace</p>
              <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>Marketplace/discovery features</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Venue Access Control
          </CardTitle>
          <CardDescription>
            Search venues, enable referral access, manage beta assignments, and apply stage overrides.
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
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredVenues.length > 0 && selectedVenueIds.size === filteredVenues.length}
                        onCheckedChange={(v) => handleSelectAll(Boolean(v))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Venue name</TableHead>
                    <TableHead>Referral access</TableHead>
                    <TableHead>Beta access</TableHead>
                    <TableHead>Effective stage</TableHead>
                    <TableHead>Override active</TableHead>
                    <TableHead>Last changed at</TableHead>
                    <TableHead>Last changed by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVenues.map((venue) => {
                    const stage = venue.referral_stage_override ?? referralStage;
                    const eligibleByBeta = !betaMode || venue.referral_beta_access;
                    const hasAccess = referralEnabled && venue.referral_enabled && eligibleByBeta;

                    return (
                      <TableRow key={venue.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedVenueIds.has(venue.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedVenueIds);
                              if (checked) next.add(venue.id);
                              else next.delete(venue.id);
                              setSelectedVenueIds(next);
                            }}
                            aria-label={`Select ${venue.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{venue.name}</p>
                          <p className="text-xs text-muted-foreground">{venue.city ?? '—'}</p>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={venue.referral_enabled}
                            onCheckedChange={(checked) => updateVenue.mutate({
                              venueId: venue.id,
                              referralEnabled: checked,
                              eventType: checked ? 'venue_referral_enabled' : 'venue_referral_disabled',
                            })}
                            disabled={updateVenue.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={venue.referral_beta_access}
                            onCheckedChange={(checked) => updateVenue.mutate({
                              venueId: venue.id,
                              referralBetaAccess: checked,
                              eventType: checked ? 'venue_beta_access_granted' : 'venue_beta_access_revoked',
                            })}
                            disabled={updateVenue.isPending}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Badge variant={hasAccess ? 'default' : 'secondary'}>
                              {hasAccess ? `Stage ${stage}` : 'Hidden'}
                            </Badge>
                            <Select
                              value={venue.referral_stage_override ? String(venue.referral_stage_override) : 'default'}
                              onValueChange={(value) => updateVenue.mutate({
                                venueId: venue.id,
                                referralStageOverride: value === 'default' ? null : Number(value),
                                eventType: value === 'default' ? 'venue_stage_override_removed' : 'venue_stage_override_set',
                              })}
                            >
                              <SelectTrigger className="w-52">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Use global ({referralStage})</SelectItem>
                                <SelectItem value="1">Stage 1</SelectItem>
                                <SelectItem value="2">Stage 2</SelectItem>
                                <SelectItem value="3">Stage 3</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>{venue.referral_stage_override ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{venue.referral_rollout_changed_at ? new Date(venue.referral_rollout_changed_at).toLocaleString() : '—'}</TableCell>
                        <TableCell>{formatActor(venue.referral_rollout_changed_by)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-4 h-4" />
            Safe Rollout Actions
          </CardTitle>
          <CardDescription>
            Bulk actions are optional and include confirmation before execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!selectedVenueIds.size || runBulkAction.isPending}
            onClick={() => setConfirmState({
              title: 'Enable Stage 1 for selected beta venues?',
              description: `This enables referrals, grants beta access, and sets stage override to 1 for ${selectedVenueIds.size} selected venues.`,
              actionLabel: 'Enable Stage 1',
              onConfirm: () => runBulkAction.mutate({ action: 'enable-stage-1-beta' }),
            })}
          >
            Enable Stage 1 for selected beta venues
          </Button>
          <Button
            variant="outline"
            disabled={!selectedVenueIds.size || runBulkAction.isPending}
            onClick={() => setConfirmState({
              title: 'Move selected beta venues to Stage 2?',
              description: `This sets stage override to 2 for ${selectedVenueIds.size} selected venues and keeps beta access enabled.`,
              actionLabel: 'Move to Stage 2',
              onConfirm: () => runBulkAction.mutate({ action: 'move-beta-stage-2' }),
            })}
          >
            Move beta venues to Stage 2
          </Button>
          <Button
            variant="destructive"
            disabled={runBulkAction.isPending}
            onClick={() => setConfirmState({
              title: 'Disable referral system globally?',
              description: 'This immediately hides all referral surfaces for non-admin users across the platform.',
              actionLabel: 'Disable globally',
              onConfirm: () => runBulkAction.mutate({ action: 'disable-global' }),
            })}
          >
            Disable referral system globally
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && setConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmState?.onConfirm();
                setConfirmState(null);
              }}
            >
              {confirmState?.actionLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
