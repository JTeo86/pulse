import { usePartnerAccess } from '@/hooks/use-partner-access';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function PartnerProfile() {
  const { referrer } = usePartnerAccess();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(referrer?.full_name ?? '');
  const [instagram, setInstagram] = useState(referrer?.instagram_handle ?? '');

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!referrer?.id) throw new Error('No referrer');
      const { error } = await supabase
        .from('referrers')
        .update({ full_name: fullName, instagram_handle: instagram || null })
        .eq('id', referrer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['partner-referrer-profile'] });
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const roleLabels: Record<string, string> = {
    influencer: 'Influencer',
    concierge: 'Concierge',
    agent: 'Agent',
    creator: 'Creator',
    planner: 'Event Planner',
    other: 'Other',
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your partner details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Full Name</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Email</label>
            <Input value={referrer?.email ?? ''} disabled className="opacity-60" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Instagram Handle</label>
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@handle" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Role Type</label>
            <Badge variant="secondary" className="capitalize">{roleLabels[referrer?.role_type ?? ''] || referrer?.role_type}</Badge>
          </div>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This will be enabled when automated payouts go live. Payouts are currently processed manually.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
