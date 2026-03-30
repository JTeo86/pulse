import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Zap, Play, Clock, FileText, TrendingUp, MessageSquareText,
  CheckCircle2, XCircle, Loader2, Calendar, Sparkles
} from 'lucide-react';
import { useAutopilotSettings, useAutopilotRuns, useAutopilotTrigger } from '@/hooks/use-autopilot';
import { formatDistanceToNow, format } from 'date-fns';

export default function AutopilotPage() {
  const { settings, loading, upsertSettings } = useAutopilotSettings();
  const { data: runs, isLoading: runsLoading } = useAutopilotRuns();
  const trigger = useAutopilotTrigger();

  const isEnabled = settings?.is_enabled ?? false;

  if (loading) {
    return (
      <>
        <PageHeader title="Autopilot" description="AI-driven marketing assistant" />
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
        title="Autopilot"
        description="AI-driven marketing that runs automatically for your venue"
      />

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Master Switch */}
        <Card className="border-accent/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-lg">Autopilot Engine</CardTitle>
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

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>Configure how Autopilot generates content for your venue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Frequency */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Frequency
                </Label>
                <Select
                  value={settings?.frequency || 'daily'}
                  onValueChange={(v) => upsertSettings.mutate({ frequency: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="3x_week">3× per week</SelectItem>
                    <SelectItem value="weekly">Once per week</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Content Volume */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Content Volume
                </Label>
                <Select
                  value={settings?.content_volume || 'medium'}
                  onValueChange={(v) => upsertSettings.mutate({ content_volume: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (1 piece)</SelectItem>
                    <SelectItem value="medium">Medium (2 pieces)</SelectItem>
                    <SelectItem value="high">High (3 pieces)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Approval Mode */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                  Approval Mode
                </Label>
                <Select
                  value={settings?.approval_mode || 'require_approval'}
                  onValueChange={(v) => upsertSettings.mutate({ approval_mode: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="require_approval">Require approval</SelectItem>
                    <SelectItem value="auto_schedule">Auto-schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Run Time */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Daily Run Time
                </Label>
                <Select
                  value={settings?.run_time?.substring(0, 5) || '09:00'}
                  onValueChange={(v) => upsertSettings.mutate({ run_time: v + ':00' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manual Trigger */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual Run</CardTitle>
            <CardDescription>Trigger Autopilot manually to generate content now</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => trigger.mutate('daily_content')}
                disabled={trigger.isPending}
                className="gap-2"
              >
                {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Generate Daily Content
              </Button>
              <Button
                variant="outline"
                onClick={() => trigger.mutate('weekly_campaign')}
                disabled={trigger.isPending}
                className="gap-2"
              >
                {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Weekly Campaign
              </Button>
              <Button
                variant="outline"
                onClick={() => trigger.mutate('review_content')}
                disabled={trigger.isPending}
                className="gap-2"
              >
                {trigger.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareText className="w-4 h-4" />}
                Generate Review Content
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Run History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run History</CardTitle>
            <CardDescription>Recent Autopilot activity</CardDescription>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !runs || runs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No runs yet. Enable Autopilot or trigger a manual run above.
              </p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-3">
                      <RunStatusIcon status={run.status} />
                      <div>
                        <p className="text-sm font-medium">
                          {run.run_type === 'daily_content' ? 'Daily Content' :
                           run.run_type === 'weekly_campaign' ? 'Weekly Campaign' : 'Review Content'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {run.status === 'completed' && run.output_summary && (
                        <Badge variant="secondary" className="text-xs">
                          {(run.output_summary as any).items_saved || 0} items
                        </Badge>
                      )}
                      {run.status === 'failed' && (
                        <Badge variant="destructive" className="text-xs">Failed</Badge>
                      )}
                      {run.status === 'running' && (
                        <Badge className="text-xs bg-accent/20 text-accent border-accent/30">Running</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-destructive" />;
    case 'running':
      return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
    default:
      return <Clock className="w-5 h-5 text-muted-foreground" />;
  }
}
