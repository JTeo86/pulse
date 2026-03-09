import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Network, Shield, Users, Mail, Building2, Trash2 } from 'lucide-react';

interface FlagRow {
  id: string;
  flag_key: string;
  is_enabled: boolean;
}

interface BetaRow {
  id: string;
  access_type: string;
  venue_id: string | null;
  email: string | null;
  status: string;
  created_at: string;
}

const FLAG_KEYS = [
  { key: 'feature.referral_network_enabled', label: 'Module Enabled', desc: 'Master toggle — hides module from all non-admin users when off.' },
  { key: 'feature.referral_network_private_beta', label: 'Private Beta', desc: 'Limit access to invited beta venues and referrers only.' },
  { key: 'feature.referral_network_public_launch', label: 'Public Launch', desc: 'Make module available to all eligible venues.' },
  { key: 'feature.referral_network_stripe_enabled', label: 'Stripe Payouts', desc: 'Enable automated Stripe Connect payouts (requires API key).' },
];

export default function ReferralNetworkTab() {
  const qc = useQueryClient();
  const [inviteType, setInviteType] = useState<'venue' | 'referrer'>('venue');
  const [inviteValue, setInviteValue] = useState('');

  // Fetch flags
  const { data: flags, isLoading: flagsLoading } = useQuery({
    queryKey: ['referral-admin-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, flag_key, is_enabled')
        .is('venue_id', null)
        .like('flag_key', 'feature.referral_network_%');
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
  });

  // Fetch beta participants
  const { data: betaList, isLoading: betaLoading } = useQuery({
    queryKey: ['referral-beta-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_beta_access')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as BetaRow[];
    },
  });

  // Toggle flag
  const toggleFlag = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('feature_flags').update({ is_enabled: enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-admin-flags'] });
      qc.invalidateQueries({ queryKey: ['referral-flags'] });
      toast.success('Flag updated');
    },
    onError: (e) => toast.error(e.message),
  });

  // Invite beta participant
  const inviteBeta = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        access_type: inviteType,
        status: 'active',
      };
      if (inviteType === 'venue') {
        payload.venue_id = inviteValue.trim();
      } else {
        payload.email = inviteValue.trim().toLowerCase();
      }
      const { error } = await supabase.from('referral_beta_access').insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-beta-list'] });
      setInviteValue('');
      toast.success('Beta access granted');
    },
    onError: (e) => toast.error(e.message),
  });

  // Revoke
  const revokeBeta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('referral_beta_access').update({ status: 'revoked' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-beta-list'] });
      toast.success('Access revoked');
    },
    onError: (e) => toast.error(e.message),
  });

  const getFlag = (key: string) => flags?.find((f) => f.flag_key === key);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Info banner */}
      <div className="p-4 rounded-lg border border-accent/20 bg-accent/5">
        <div className="flex items-start gap-3">
          <Network className="w-5 h-5 text-accent mt-0.5" />
          <div>
            <h4 className="font-medium text-sm">Referral Network</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Partner, influencer, concierge, and agent referral tracking. Currently hidden from normal users until enabled.
              Private Beta limits access to invited venues and partners only. Public Launch makes it available to all eligible venues.
            </p>
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Rollout Controls
          </CardTitle>
          <CardDescription>Control module visibility and feature stages.</CardDescription>
        </CardHeader>
        <CardContent>
          {flagsLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : (
            <div className="space-y-4">
              {FLAG_KEYS.map(({ key, label, desc }) => {
                const flag = getFlag(key);
                if (!flag) return null;
                return (
                  <div key={key} className="flex items-center justify-between gap-4 p-3 rounded-lg border">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={flag.is_enabled}
                      onCheckedChange={(v) => toggleFlag.mutate({ id: flag.id, enabled: v })}
                      disabled={toggleFlag.isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Beta Access Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Private Beta Access
          </CardTitle>
          <CardDescription>Invite venues or referrers to the private beta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={inviteType} onValueChange={(v) => setInviteType(v as 'venue' | 'referrer')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="venue">Venue</SelectItem>
                <SelectItem value="referrer">Referrer</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={inviteType === 'venue' ? 'Venue ID (UUID)' : 'Referrer email'}
              value={inviteValue}
              onChange={(e) => setInviteValue(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => inviteBeta.mutate()}
              disabled={!inviteValue.trim() || inviteBeta.isPending}
              size="sm"
            >
              Invite
            </Button>
          </div>

          {betaLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : !betaList?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No beta participants yet.</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {betaList.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.access_type === 'venue' ? (
                        <Badge variant="outline" className="gap-1"><Building2 className="w-3 h-3" />Venue</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1"><Mail className="w-3 h-3" />Referrer</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.access_type === 'venue' ? row.venue_id : row.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'active' ? 'default' : row.status === 'revoked' ? 'destructive' : 'secondary'}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status !== 'revoked' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => revokeBeta.mutate(row.id)}
                          disabled={revokeBeta.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
