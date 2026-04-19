import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type BookingStatus = 'created' | 'booking_confirmed' | 'visited';
type PayoutPeriodStatus = 'open' | 'locked' | 'paid';

interface FormState {
  partnerId: string;
  amount: string;
  status: BookingStatus;
  date: string;
}

interface PartnerOption {
  id: string;
  full_name: string;
}

interface BookingRow {
  id: string;
  bill_amount: number | null;
  commission: number | null;
  status: string;
  booking_date: string | null;
  created_at: string;
  referrers: { full_name: string } | null;
}

interface PayoutPeriodRow {
  id: string;
  month: string;
  status: PayoutPeriodStatus;
  paid_at: string | null;
  total_commission: number | null;
  total_platform_fee: number | null;
  total_partner_payout: number | null;
}

const defaultFormState: FormState = {
  partnerId: '',
  amount: '',
  status: 'booking_confirmed',
  date: new Date().toISOString().slice(0, 10),
};

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const PLATFORM_FEE_RATE = 0.1;

export default function VenueReferralsPage() {
  const { currentVenue } = useVenue();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [activeTab, setActiveTab] = useState<'bookings' | 'payouts'>('bookings');

  const { data: partners = [] } = useQuery<PartnerOption[]>({
    queryKey: ['venue-referral-partners', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrers')
        .select('id, full_name')
        .eq('venue_id', currentVenue!.id)
        .order('full_name', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bookings = [], isLoading } = useQuery<BookingRow[]>({
    queryKey: ['venue-referral-bookings', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('id, partner_id, bill_amount, commission, status, booking_date, created_at, referrers(full_name)')
        .eq('venue_id', currentVenue!.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payoutPeriods = [] } = useQuery<PayoutPeriodRow[]>({
    queryKey: ['venue-referral-payout-periods', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_periods')
        .select('id, month, status, paid_at, total_commission, total_platform_fee, total_partner_payout')
        .eq('venue_id', currentVenue!.id)
        .order('month', { ascending: false })
        .limit(12);

      if (error) throw error;
      return (data as PayoutPeriodRow[]) ?? [];
    },
  });

  const overview = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        const amount = Number(booking.bill_amount ?? 0);
        const commission = Number(booking.commission ?? 0);
        acc.revenueDriven += amount;
        if (booking.status !== 'paid') acc.commissionOwed += commission;
        acc.bookingsCount += 1;
        return acc;
      },
      { revenueDriven: 0, commissionOwed: 0, bookingsCount: 0 },
    );
  }, [bookings]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);

  const currentMonthBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const bookingDate = booking.booking_date ?? booking.created_at;
      return bookingDate.slice(0, 7) === currentMonthKey;
    });
  }, [bookings, currentMonthKey]);

  const currentMonthPayout = useMemo(() => {
    const partnersToPay = new Set<string>();
    const totalCommissionDue = currentMonthBookings.reduce((sum, booking) => {
      if (booking.status === 'paid') return sum;
      if (booking.referrers?.full_name) partnersToPay.add(booking.referrers.full_name);
      return sum + Number(booking.commission ?? 0);
    }, 0);

    const totalPlatformFee = Number((totalCommissionDue * PLATFORM_FEE_RATE).toFixed(2));
    const totalPartnerPayout = Number((totalCommissionDue - totalPlatformFee).toFixed(2));

    return {
      monthLabel: monthFormat.format(new Date(`${currentMonthKey}-01T00:00:00Z`)),
      totalCommissionDue,
      totalPlatformFee,
      totalPartnerPayout,
      bookingsCount: currentMonthBookings.length,
      partnersCount: partnersToPay.size,
    };
  }, [currentMonthBookings, currentMonthKey]);

  const currentPeriod = useMemo(
    () => payoutPeriods.find((period) => period.month.slice(0, 7) === currentMonthKey),
    [currentMonthKey, payoutPeriods],
  );

  const lastPaidPeriod = useMemo(() => payoutPeriods.find((period) => period.status === 'paid'), [payoutPeriods]);

  const upsertPayoutPeriod = useMutation({
    mutationFn: async ({ status }: { status: PayoutPeriodStatus }) => {
      if (!currentVenue) return;

      const monthDate = `${currentMonthKey}-01`;
      const payload = {
        venue_id: currentVenue.id,
        month: monthDate,
        status,
        total_commission: currentMonthPayout.totalCommissionDue,
        total_platform_fee: currentMonthPayout.totalPlatformFee,
        total_partner_payout: currentMonthPayout.totalPartnerPayout,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('payout_periods')
        .upsert(payload, { onConflict: 'venue_id,month' });

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['venue-referral-payout-periods'] });
      toast.success(variables.status === 'locked' ? 'Month locked for payout review' : 'Month marked as paid');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addBooking = useMutation({
    mutationFn: async () => {
      if (!currentVenue) return;

      const amount = Number(form.amount);
      if (!form.partnerId || Number.isNaN(amount) || amount <= 0 || !form.date) {
        throw new Error('Please provide partner, amount, and date.');
      }

      const { error } = await supabase.from('referrals').insert({
        venue_id: currentVenue.id,
        partner_id: form.partnerId,
        bill_amount: amount,
        commission: Number((amount * 0.1).toFixed(2)),
        status: form.status,
        source_type: 'manual',
        booking_date: form.date,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-referral-bookings'] });
      setForm(defaultFormState);
      setIsDialogOpen(false);
      toast.success('Booking added');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Referrals" description="Track booking revenue and owed commissions from your referral partners." />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Revenue Driven" value={`£${overview.revenueDriven.toFixed(2)}`} />
        <StatCard label="Commission Owed" value={`£${overview.commissionOwed.toFixed(2)}`} />
        <StatCard label="Bookings Count" value={overview.bookingsCount.toString()} />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'bookings' | 'payouts')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Bookings</CardTitle>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Add booking</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add booking</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Partner</Label>
                      <Select value={form.partnerId} onValueChange={(value) => setForm((prev) => ({ ...prev, partnerId: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a partner" />
                        </SelectTrigger>
                        <SelectContent>
                          {partners.map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                              {partner.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(value: BookingStatus) => setForm((prev) => ({ ...prev, status: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created">Created</SelectItem>
                          <SelectItem value="booking_confirmed">Booking confirmed</SelectItem>
                          <SelectItem value="visited">Visited</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => addBooking.mutate()} disabled={addBooking.isPending}>Save booking</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading bookings…</p>
              ) : bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-medium">{booking.referrers?.full_name ?? 'Partner'}</TableCell>
                        <TableCell>£{Number(booking.bill_amount ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {String(booking.status).replaceAll('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(booking.booking_date ?? booking.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Due this month" value={`£${currentMonthPayout.totalCommissionDue.toFixed(2)}`} />
            <StatCard label="Platform fee" value={`£${currentMonthPayout.totalPlatformFee.toFixed(2)}`} />
            <StatCard label="Partner payout total" value={`£${currentMonthPayout.totalPartnerPayout.toFixed(2)}`} />
            <StatCard
              label="Last payout"
              value={lastPaidPeriod ? monthFormat.format(new Date(lastPaidPeriod.month)) : 'No payouts yet'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current month payout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-6">
                <PayoutMeta label="Month" value={currentMonthPayout.monthLabel} />
                <PayoutMeta label="Total commission due" value={`£${currentMonthPayout.totalCommissionDue.toFixed(2)}`} />
                <PayoutMeta label="Platform fee (10%)" value={`£${currentMonthPayout.totalPlatformFee.toFixed(2)}`} />
                <PayoutMeta label="Partner payout total" value={`£${currentMonthPayout.totalPartnerPayout.toFixed(2)}`} />
                <PayoutMeta label="Bookings" value={currentMonthPayout.bookingsCount.toString()} />
                <PayoutMeta label="Partners to pay" value={currentMonthPayout.partnersCount.toString()} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => toast.message('Review the payout items list below.')}>Review</Button>
                <Button
                  variant="outline"
                  onClick={() => upsertPayoutPeriod.mutate({ status: 'locked' })}
                  disabled={upsertPayoutPeriod.isPending || currentPeriod?.status === 'paid'}
                >
                  Lock month
                </Button>
                <Button
                  onClick={() => upsertPayoutPeriod.mutate({ status: 'paid' })}
                  disabled={upsertPayoutPeriod.isPending || currentMonthPayout.bookingsCount === 0}
                >
                  Mark as paid
                </Button>
                {currentPeriod?.status ? (
                  <Badge variant="secondary" className="capitalize">{currentPeriod.status}</Badge>
                ) : (
                  <Badge variant="secondary">open</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payout items</CardTitle>
            </CardHeader>
            <CardContent>
              {!currentMonthBookings.length ? (
                <p className="text-sm text-muted-foreground">No payout items in the current month yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Booking / date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentMonthBookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-medium">{booking.referrers?.full_name ?? 'Partner'}</TableCell>
                        <TableCell>{new Date(booking.booking_date ?? booking.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>£{Number(booking.commission ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {currentPeriod?.status ?? 'open'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payout history</CardTitle>
            </CardHeader>
            <CardContent>
              {!payoutPeriods.length ? (
                <p className="text-sm text-muted-foreground">No payout history yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Total due</TableHead>
                      <TableHead>Platform fee</TableHead>
                      <TableHead>Partner payout</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payoutPeriods.map((period) => (
                      <TableRow key={period.id}>
                        <TableCell className="font-medium">{monthFormat.format(new Date(period.month))}</TableCell>
                        <TableCell>£{Number(period.total_commission ?? 0).toFixed(2)}</TableCell>
                        <TableCell>£{Number(period.total_platform_fee ?? 0).toFixed(2)}</TableCell>
                        <TableCell>£{Number(period.total_partner_payout ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">{period.status}</Badge>
                        </TableCell>
                        <TableCell>{period.paid_at ? new Date(period.paid_at).toLocaleDateString() : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function PayoutMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-medium">{value}</p>
    </div>
  );
}
