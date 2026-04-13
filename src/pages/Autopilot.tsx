import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useAutopilotRuns, useAutopilotSettings } from '@/hooks/use-autopilot';
import { generateContentRequests } from '@/lib/content-requests';

export default function AutopilotPage() {
  const { currentVenue } = useVenue();
  const { settings, loading, upsertSettings } = useAutopilotSettings();
  const { data: runs = [], isLoading: runsLoading } = useAutopilotRuns();

  const { data: needsFromYou = [], isLoading: needsLoading } = useQuery({
    queryKey: ['autopilot-needs', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      if (!currentVenue) return [];

      const [scheduledContentRes, assetRes, usageRes, reviewsRes] = await Promise.all([
        supabase
          .from('content_items')
          .select('scheduled_for, title, caption_draft')
          .eq('venue_id', currentVenue.id)
          .not('scheduled_for', 'is', null)
          .order('scheduled_for', { ascending: false })
          .limit(120),
        supabase
          .from('content_assets')
          .select('id, title, metadata')
          .eq('venue_id', currentVenue.id)
          .eq('asset_type', 'image')
          .in('source_type', ['upload', 'manual', 'guest_upload'])
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('content_items')
          .select('media_variants')
          .eq('venue_id', currentVenue.id)
          .eq('source', 'autopilot')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('review_response_tasks')
          .select('review_text')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(80),
      ]);

      const scheduledContent = scheduledContentRes.data || [];
      const assets = assetRes.data || [];
      const usageItems = usageRes.data || [];
      const reviewTexts = (reviewsRes.data || []).map((item: any) => String(item.review_text || '').toLowerCase());

      const hasLunch = scheduledContent.some((item: any) => {
        if (!item.scheduled_for) return false;
        const hour = new Date(item.scheduled_for).getHours();
        const text = `${item.title || ''} ${item.caption_draft || ''}`.toLowerCase();
        return (hour >= 11 && hour <= 15) || text.includes('lunch');
      });
      const hasDinner = scheduledContent.some((item: any) => {
        if (!item.scheduled_for) return false;
        const hour = new Date(item.scheduled_for).getHours();
        const text = `${item.title || ''} ${item.caption_draft || ''}`.toLowerCase();
        return hour >= 17 || text.includes('dinner');
      });
      const hasWeekend = scheduledContent.some((item: any) => {
        if (!item.scheduled_for) return false;
        const day = new Date(item.scheduled_for).getDay();
        return day === 0 || day === 6;
      });

      const usedAssetIds = new Set<string>();
      for (const usage of usageItems) {
        const mediaVariants = (usage as any).media_variants || {};
        const sourceAssetId = mediaVariants?.source_asset_id;
        if (sourceAssetId) usedAssetIds.add(String(sourceAssetId));
      }
      const unusedImageCount = assets.filter((asset: any) => !usedAssetIds.has(asset.id)).length;

      const hasDrinks = assets.some((asset: any) => {
        const text = `${asset.title || ''} ${JSON.stringify(asset.metadata || {})}`.toLowerCase();
        return ['cocktail', 'drink', 'wine', 'beer', 'beverage', 'mocktail'].some((keyword) => text.includes(keyword));
      });
      const hasVenue = assets.some((asset: any) => {
        const text = `${asset.title || ''} ${JSON.stringify(asset.metadata || {})}`.toLowerCase();
        return ['interior', 'dining room', 'atmosphere', 'ambience', 'venue', 'patio', 'bar'].some((keyword) => text.includes(keyword));
      });
      const hasFood = assets.some((asset: any) => {
        const text = `${asset.title || ''} ${JSON.stringify(asset.metadata || {})}`.toLowerCase();
        return ['dish', 'food', 'menu', 'plate', 'dessert', 'meal'].some((keyword) => text.includes(keyword));
      });

      return generateContentRequests({
        coverage: { hasLunch, hasDinner, hasWeekend },
        assets: { unusedImageCount },
        reviewSignals: { mentions: reviewTexts },
        contentMix: { hasFood, hasDrinks, hasVenue },
      });
    },
  });

  const latestRun = runs[0];

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Autopilot" description="Autopilot status and activity." />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Autopilot" description="Autopilot status, schedule, and recent activity." />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Autopilot status</span>
            <div className="flex items-center gap-2">
              <Badge variant={settings?.is_enabled ? 'default' : 'secondary'}>{settings?.is_enabled ? 'On' : 'Off'}</Badge>
              <Switch
                checked={settings?.is_enabled ?? false}
                onCheckedChange={(checked) => upsertSettings.mutate({ is_enabled: checked })}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <InfoRow label="Last run" value={latestRun ? formatDistanceToNow(new Date(latestRun.created_at), { addSuffix: true }) : 'Never'} />
            <InfoRow label="Next run" value={getNextRunLabel(settings?.frequency, settings?.run_time)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs from you</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {needsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>
          ) : needsFromYou.length === 0 ? (
            <p className="text-sm text-muted-foreground">No urgent requests right now.</p>
          ) : (
            <ul className="space-y-2">
              {needsFromYou.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>{item.title}</span>
                  <Button asChild size="sm" variant="outline"><Link to={item.ctaTo}>{item.ctaLabel}</Link></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Autopilot activity</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {runsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            runs.slice(0, 5).map((run) => (
              <div key={run.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                <div className="flex items-center gap-2">
                  {run.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : run.status === 'failed' ? <XCircle className="w-4 h-4 text-red-500" /> : <Clock3 className="w-4 h-4 text-muted-foreground" />}
                  <span className="capitalize">{run.run_type.replace('_', ' ')}</span>
                </div>
                <span className="text-muted-foreground">{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-1">{value}</p>
    </div>
  );
}

function getNextRunLabel(frequency?: 'daily' | '3x_week' | 'weekly', runTime?: string) {
  if (!frequency || !runTime) return 'Set in Setup';

  const now = new Date();
  const [hour, minute] = runTime.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hour || 9, minute || 0, 0, 0);

  if (frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    next.setDate(next.getDate() + 2);
  }

  return formatDistanceToNow(next, { addSuffix: true });
}
