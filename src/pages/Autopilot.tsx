import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Play, Clock, FileText, MessageSquareText,
  CheckCircle2, XCircle, Loader2, Calendar, Sparkles, ExternalLink, AlertTriangle
} from 'lucide-react';
import { useAutopilotSettings, useAutopilotRuns, useAutopilotTrigger } from '@/hooks/use-autopilot';
import { formatDistanceToNow } from 'date-fns';

export default function AutopilotPage() {
  const { settings, loading, upsertSettings } = useAutopilotSettings();
  const { data: runs, isLoading: runsLoading } = useAutopilotRuns();
  const trigger = useAutopilotTrigger();
  const navigate = useNavigate();

  const isEnabled = settings?.is_enabled ?? false;
  const latestRun = runs?.[0];
  const latestRunSavedIds = latestRun?.saved_library_item_ids?.length ? latestRun.saved_library_item_ids : latestRun?.content_item_ids;
  const latestRunHasSavedItems = !!latestRunSavedIds?.length;
  const latestRunSummary = latestRun
    ? `${latestRun.saved_count ?? latestRun.items_saved ?? 0} saved of ${latestRun.generated_count ?? latestRun.items_generated ?? 0} generated`
    : 'No runs yet.';
  const latestRunDiagnostic = latestRun ? buildRunDiagnosticSummary(latestRun) : null;
  const lastRunAttention = !latestRun
    ? 'Run Pulse Now to generate your first batch of content.'
    : latestRun.status === 'failed'
      ? (latestRun.error_message || 'Last run failed. Open run details to troubleshoot.')
      : latestRun.status === 'partial'
        ? (latestRun.error_message || 'Last run was partial. Review diagnostics and retry.')
        : 'No immediate issues detected.';
  const nextScheduledRun = settings ? getNextScheduledRunLabel(settings.frequency, settings.run_time) : 'Set cadence in Settings';

  const runPulseNow = () => trigger.mutate('daily_content');
  const viewLastRunDetails = () => {
    if (latestRunHasSavedItems && latestRun?.id) {
      navigate(`/content/library?source=autopilot&autopilotRunId=${latestRun.id}&contentItemIds=${(latestRunSavedIds || []).join(',')}`);
      return;
    }
    const section = document.getElementById('autopilot-run-history');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Automation Settings & Diagnostics" description="Advanced controls and run history for Pulse Engine." />
        <div className="p-6 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Automation Settings & Diagnostics"
        description="Pulse runs in the background. Use this page for advanced controls and troubleshooting."
      />

      <div className="p-6 space-y-6 max-w-5xl">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pulse Engine runs in the background</AlertTitle>
          <AlertDescription>
            This compatibility page remains available for existing bookmarks. Day-to-day work now lives in Home, Content, Reviews, and Setup.
          </AlertDescription>
        </Alert>
        <Card className="border-accent/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">Pulse Engine</CardTitle>
                  <CardDescription>
                    {isEnabled ? 'Autopilot is active and generating content' : 'Enable to start automatic content generation'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isEnabled ? 'default' : 'secondary'} className={isEnabled ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}>
                  {isEnabled ? 'Active' : 'Off'}
                </Badge>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => upsertSettings.mutate({ is_enabled: checked })}
                />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-accent/20">
          <CardHeader>
            <CardTitle className="text-base">Command Center</CardTitle>
            <CardDescription>One-click Pulse operation with manual tools for advanced control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Last run</p>
                <p className="font-medium mt-1">
                  {latestRun ? formatDistanceToNow(new Date(latestRun.created_at), { addSuffix: true }) : 'Never'}
                </p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next scheduled run</p>
                <p className="font-medium mt-1">{nextScheduledRun}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">What happened in last run</p>
                <p className="font-medium mt-1">{latestRunSummary}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">What needs attention</p>
                <p className="font-medium mt-1">{lastRunAttention}</p>
              </div>
            </div>
            {latestRunDiagnostic && (
              <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Autopilot diagnostics</p>
                <p className="text-sm font-medium">{latestRunDiagnostic.primaryMessage}</p>
                {latestRunDiagnostic.recommendedActions.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                    {latestRunDiagnostic.recommendedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Button onClick={runPulseNow} disabled={trigger.isPending} className="gap-2 w-full sm:w-auto">
              {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Run Pulse Now
            </Button>

            <Accordion type="single" collapsible className="w-full border rounded-md px-4">
              <AccordionItem value="manual-tools" className="border-0">
                <AccordionTrigger className="text-sm">Advanced Manual Tools</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <Button variant="outline" onClick={() => trigger.mutate('daily_content')} disabled={trigger.isPending} className="gap-2">
                      {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Generate Daily Posts
                    </Button>
                    <Button variant="outline" onClick={() => trigger.mutate('weekly_campaign')} disabled={trigger.isPending} className="gap-2">
                      {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Generate Weekly Plan
                    </Button>
                    <Button variant="outline" onClick={() => trigger.mutate('review_content')} disabled={trigger.isPending} className="gap-2">
                      {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareText className="w-4 h-4" />}Generate Review Posts
                    </Button>
                    <Button variant="ghost" onClick={viewLastRunDetails} className="gap-2">
                      View Last Run Details <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>Configure cadence and asset-first guardrails</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Require asset source</p>
                  <p className="text-xs text-muted-foreground">Skip run if no eligible image source exists.</p>
                </div>
                <Switch
                  checked={settings?.require_asset_for_runs ?? true}
                  onCheckedChange={(checked) => upsertSettings.mutate({ require_asset_for_runs: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Allow copy-only fallback</p>
                  <p className="text-xs text-muted-foreground">Only used when no eligible asset is found.</p>
                </div>
                <Switch
                  checked={settings?.allow_copy_only_fallback ?? false}
                  onCheckedChange={(checked) => upsertSettings.mutate({ allow_copy_only_fallback: checked })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" />Frequency</Label>
                <Select value={settings?.frequency || 'daily'} onValueChange={(v) => upsertSettings.mutate({ frequency: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="3x_week">3× per week</SelectItem>
                    <SelectItem value="weekly">Once per week</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />Content Volume</Label>
                <Select value={settings?.content_volume || 'medium'} onValueChange={(v) => upsertSettings.mutate({ content_volume: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (1 piece)</SelectItem>
                    <SelectItem value="medium">Medium (2 pieces)</SelectItem>
                    <SelectItem value="high">High (3 pieces)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-muted-foreground" />Approval Mode</Label>
                <Select value={settings?.approval_mode || 'require_approval'} onValueChange={(v) => upsertSettings.mutate({ approval_mode: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="require_approval">Require approval (default)</SelectItem>
                    <SelectItem value="auto_schedule">Auto-schedule (advanced)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" />Daily Run Time</Label>
                <Select value={settings?.run_time?.substring(0, 5) || '09:00'} onValueChange={(v) => upsertSettings.mutate({ run_time: `${v}:00` })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-muted-foreground" />Mode</Label>
                <Select value={settings?.mode || 'conservative'} onValueChange={(v) => upsertSettings.mutate({ mode: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="creative">Creative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="autopilot-run-history">
          <CardHeader>
            <CardTitle className="text-base">Run History</CardTitle>
            <CardDescription>Diagnostics and direct links to generated library items</CardDescription>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : !runs?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No runs yet. Enable Autopilot or use Run Pulse Now.</p>
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  (() => {
                    const savedIds = run.saved_library_item_ids?.length ? run.saved_library_item_ids : run.content_item_ids;
                    const hasSavedItems = !!savedIds?.length;
                    const openDisabledReason = hasSavedItems
                      ? ''
                      : run.error_message || 'No items were successfully saved to Content for this run.';

                    return (
                  <div key={run.id} className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <RunStatusIcon status={run.status} />
                        <div>
                          <p className="text-sm font-medium">
                            {run.run_type === 'daily_content' ? 'Daily Posts' : run.run_type === 'weekly_campaign' ? 'Weekly Plan' : 'Review Posts'}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</p>
                        </div>
                      </div>
                      <Badge variant={run.status === 'failed' ? 'destructive' : 'secondary'} className="capitalize">{(run.run_status || run.status).replace('_', ' ')}</Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <Stat label="Generated" value={run.generated_count ?? run.items_generated ?? (run.output_summary as any)?.generated_count ?? (run.output_summary as any)?.items_generated ?? 0} />
                      <Stat label="Saved to Content" value={run.saved_count ?? run.items_saved ?? (run.output_summary as any)?.saved_count ?? (run.output_summary as any)?.items_saved ?? 0} />
                      <Stat label="Failed" value={run.failed_count ?? run.items_failed ?? (run.output_summary as any)?.failed_count ?? (run.output_summary as any)?.items_failed ?? 0} />
                    </div>

                    {run.error_message && <p className="text-xs text-destructive">{run.error_message}</p>}
                    {(() => {
                      const diagnostics = buildRunDiagnosticSummary(run);
                      if (!diagnostics.primaryMessage && diagnostics.recommendedActions.length === 0) return null;
                      return (
                        <div className="rounded-md border bg-background/80 px-3 py-2">
                          {diagnostics.primaryMessage && (
                            <p className="text-xs text-muted-foreground">{diagnostics.primaryMessage}</p>
                          )}
                          {diagnostics.recommendedActions.length > 0 && (
                            <ul className="mt-1 list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                              {diagnostics.recommendedActions.map((action) => <li key={action}>{action}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                    {!hasSavedItems && <p className="text-xs text-muted-foreground">Open generated items unavailable: {openDisabledReason}</p>}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={!hasSavedItems}
                        onClick={() => navigate(`/content/library?source=autopilot&autopilotRunId=${run.id}&contentItemIds=${(savedIds || []).join(',')}`)}
                      >
                        Open generated items <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function getNextScheduledRunLabel(frequency: 'daily' | '3x_week' | 'weekly', runTime?: string | null): string {
  const safeRunTime = runTime?.substring(0, 5) || '09:00';
  const [hour, minute] = safeRunTime.split(':').map((piece) => Number(piece));
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hour || 9, minute || 0, 0, 0);

  const schedule3xWeek = [1, 3, 5];
  if (frequency === 'daily') {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
  } else if (frequency === 'weekly') {
    const daysUntilMonday = (8 - candidate.getDay()) % 7 || 7;
    if (candidate.getDay() !== 1 || candidate <= now) candidate.setDate(candidate.getDate() + daysUntilMonday);
  } else {
    const weekday = candidate.getDay();
    const todayOnSchedule = schedule3xWeek.includes(weekday);
    if (todayOnSchedule && candidate > now) {
      // keep current candidate
    } else {
      let daysToAdd = 1;
      while (!schedule3xWeek.includes((weekday + daysToAdd) % 7)) daysToAdd += 1;
      candidate.setDate(candidate.getDate() + daysToAdd);
    }
  }

  return candidate.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'partial': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case 'failed': return <XCircle className="w-5 h-5 text-destructive" />;
    case 'running': return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
    default: return <Clock className="w-5 h-5 text-muted-foreground" />;
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border/60 bg-background px-2 py-1.5"><p className="text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>;
}

function buildRunDiagnosticSummary(run: any) {
  const summary = (run.output_summary || {}) as Record<string, any>;
  const sourceSummary = (summary.source_summary || {}) as Record<string, number>;
  const p1 = Number(sourceSummary.priority_1 || 0);
  const p2 = Number(sourceSummary.priority_2 || 0);
  const p3 = Number(sourceSummary.priority_3 || 0);
  const p4 = Number(sourceSummary.priority_4 || 0);
  const p5 = Number(sourceSummary.priority_5 || 0);
  const sourceLine = `Assets found — reusable pool: ${p1}, planner-linked: ${p2}, approved library: ${p3}, recent uploads: ${p4}, approved guest photos: ${p5}.`;
  const copyOnly = Boolean(summary.copy_only_fallback_used);
  const blocked = Boolean(summary.asset_blocked);
  const recommendedActions = Array.isArray(summary.recommended_next_asset_actions)
    ? summary.recommended_next_asset_actions.map((x: any) => String(x))
    : [];

  let primaryMessage = sourceLine;
  if (blocked) {
    primaryMessage = `Run blocked by asset coverage. ${sourceLine}`;
  } else if (copyOnly) {
    primaryMessage = `Pulse generated copy-only drafts because no eligible photos were found. ${sourceLine}`;
  }

  if (summary.diagnostic_message) {
    primaryMessage = `${primaryMessage} ${String(summary.diagnostic_message)}`;
  }

  return { primaryMessage, recommendedActions };
}
