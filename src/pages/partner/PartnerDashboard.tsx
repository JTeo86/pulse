import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';


type DashboardActivityRow = {
  id: string;
  billAmount: number;
  commissionAmount: number;
  bookingDate: string | null;
  createdAt: string;
  status: 'Pending' | 'Approved' | 'Paid';
  venueName: string;
};

type DashboardData = {
  pendingEarnings: number;
  paidEarnings: number;
  bookingsCount: number;
  activity: DashboardActivityRow[];
  monthlyHistory: Array<{
    month: string;
    totalEarned: number;
    status: 'Pending' | 'Paid';
  }>;
};

export default function PartnerDashboard() {
  const { referrer } = usePartnerAccess();
  const [copiedField, setCopiedField] = useState<'link' | 'code' | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['partner-dashboard-mvp', referrer?.id],
    queryFn: async (): Promise<DashboardData | null> => {
      if (!referrer?.id) return null;

      const { data: commissions, error } = await supabase
        .from('commissions')
        .select('id, bill_amount, commission_value, created_at, status, referrals(booking_date), venues(name)')
        .eq('partner_id', referrer.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (commissions ?? []).map((row: any): DashboardActivityRow => ({
        id: row.id,
        billAmount: Number(row.bill_amount || 0),
        commissionAmount: Number(row.commission_value || 0),
        bookingDate: row.referrals?.booking_date ?? null,
        createdAt: row.created_at,
        status: toPartnerStatus(row.status),
        venueName: row.venues?.name ?? 'Venue booking',
      }));

      const pendingEarnings = rows
        .filter((row) => row.status !== 'Paid')
        .reduce((sum, row) => sum + row.commissionAmount, 0);

      const paidEarnings = rows
        .filter((row) => row.status === 'Paid')
        .reduce((sum, row) => sum + row.commissionAmount, 0);

      const monthlyMap = new Map<string, { totalEarned: number; status: 'Pending' | 'Paid' }>();
      rows.forEach((row) => {
        const monthKey = (row.bookingDate || row.createdAt).slice(0, 7);
        const current = monthlyMap.get(monthKey) ?? { totalEarned: 0, status: 'Pending' as const };
        current.totalEarned += row.commissionAmount;
        if (row.status === 'Paid') {
          current.status = 'Paid';
        }
        monthlyMap.set(monthKey, current);
      });

      const monthlyHistory = Array.from(monthlyMap.entries())
        .map(([month, summary]) => ({
          month,
          totalEarned: summary.totalEarned,
          status: summary.status,
        }))
        .sort((a, b) => b.month.localeCompare(a.month));

      return {
        pendingEarnings,
        paidEarnings,
        bookingsCount: rows.length,
        activity: rows.slice(0, 8),
        monthlyHistory,
      };
    },
    enabled: !!referrer?.id,
  });

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Your earnings</h1>
        <p className="text-muted-foreground">Track bookings, commissions, and payouts.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label="Pending" value={data?.pendingEarnings ?? 0} isLoading={isLoading} format="currency" />
        <SummaryCard label="Paid" value={data?.paidEarnings ?? 0} isLoading={isLoading} format="currency" />
        <SummaryCard label="Bookings" value={data?.bookingsCount ?? 0} isLoading={isLoading} format="number" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !data?.activity.length ? (
            <div className="rounded-md border border-dashed border-border p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">No bookings yet</p>
              <p className="text-sm text-muted-foreground">Once a venue logs your referrals, they’ll show up here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Venue</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-right">Bill</th>
                    <th className="px-3 py-2 font-medium text-right">Commission</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activity.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 text-foreground">{item.venueName}</td>
                      <td className="px-3 py-3 text-foreground">{formatDate(item.bookingDate || item.createdAt)}</td>
                      <td className="px-3 py-3 text-right text-foreground">{formatCurrency(item.billAmount)}</td>
                      <td className="px-3 py-3 text-right text-foreground">{formatCurrency(item.commissionAmount)}</td>
                      <td className="px-3 py-3">
                        <Badge variant={item.status === 'Paid' ? 'default' : 'secondary'}>{item.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly history</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.monthlyHistory.length ? (
            <div className="rounded-md border border-dashed border-border p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">Nothing paid yet</p>
              <p className="text-sm text-muted-foreground">Approved referrals will appear here once payouts are completed.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.monthlyHistory.map((month) => (
                <div key={month.month} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatMonth(month.month)}</p>
                    <p className="text-xs text-muted-foreground">Total earned</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(month.totalEarned)}</p>
                    <Badge variant={month.status === 'Paid' ? 'default' : 'secondary'}>{month.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField
            label="Referral link"
            value={referrer?.referral_slug ? `${window.location.origin}/r/${referrer.referral_slug}` : '—'}
            onCopy={() => copyValue(referrer?.referral_slug ? `${window.location.origin}/r/${referrer.referral_slug}` : '', 'link', setCopiedField)}
            copied={copiedField === 'link'}
          />
          <CopyField
            label="Referral code"
            value={referrer?.referral_code || '—'}
            onCopy={() => copyValue(referrer?.referral_code || '', 'code', setCopiedField)}
            copied={copiedField === 'code'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partner profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <ProfileField label="Name" value={referrer?.full_name || '—'} />
          <ProfileField label="Partner type" value={referrer?.role_type || 'Partner'} />
          <ProfileField label="Referral status" value={referrer?.referral_active ? 'Active' : 'Paused'} />
        </CardContent>
      </Card>
    </div>
  );
}

function CopyField({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="text-sm text-foreground bg-muted px-2 py-1 rounded truncate block flex-1">{value}</code>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onCopy}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  isLoading,
  format,
}: {
  label: string;
  value: number;
  isLoading: boolean;
  format: 'currency' | 'number';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-24 mt-2" />
        ) : (
          <p className="text-2xl font-semibold text-foreground mt-1">
            {format === 'currency' ? formatCurrency(value) : value.toLocaleString('en-GB')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-1">{value}</p>
    </div>
  );
}

function formatCurrency(value: number) {
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonth(monthValue: string) {
  return new Date(`${monthValue}-01`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function toPartnerStatus(status: string): 'Pending' | 'Approved' | 'Paid' {
  if (status === 'paid') return 'Paid';
  if (['approved', 'final', 'locked', 'adjusted'].includes(status)) return 'Approved';
  return 'Pending';
}

function copyValue(
  value: string,
  field: 'link' | 'code',
  setCopiedField: (value: 'link' | 'code' | null) => void,
) {
  if (!value) return;
  navigator.clipboard.writeText(value);
  setCopiedField(field);
  toast.success(field === 'link' ? 'Referral link copied' : 'Referral code copied');
  setTimeout(() => setCopiedField(null), 1800);
}
