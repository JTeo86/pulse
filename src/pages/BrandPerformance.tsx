import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAnalyticsData } from '@/hooks/use-analytics-data';
import { useVenue } from '@/lib/venue-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Upload, Image, PenTool, CalendarDays, FileText, TrendingUp, DollarSign, Target, UtensilsCrossed } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { EmptyState } from '@/components/ui/empty-state';

const CHART_COLORS = [
  'hsl(42, 75%, 55%)',
  'hsl(210, 50%, 55%)',
  'hsl(145, 40%, 45%)',
  'hsl(0, 62%, 55%)',
  'hsl(280, 50%, 55%)',
];

const chartTooltipStyle = {
  background: 'hsl(220, 15%, 10%)',
  border: '1px solid hsl(220, 12%, 16%)',
  borderRadius: 8,
  fontSize: 12,
};

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number | string; sub?: string }) {
  return (
    <Card className="card-elevated card-hover">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div>
          <p className="text-2xl font-semibold font-sans">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Revenue Impact Tab ─── */
function RevenueImpactTab() {
  const { currentVenue } = useVenue();
  const { data: signals, isLoading } = useQuery({
    queryKey: ['revenue-signals', currentVenue?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_signals')
        .select('*')
        .eq('venue_id', currentVenue!.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Card key={i} className="h-24 animate-pulse" />)}</div>;

  const totalRevenue = signals?.reduce((sum, s) => sum + (Number(s.revenue_estimate) || 0), 0) ?? 0;
  const bySource: Record<string, number> = {};
  signals?.forEach(s => { bySource[s.source_type] = (bySource[s.source_type] || 0) + (Number(s.revenue_estimate) || 0); });
  const sourceData = Object.entries(bySource).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Total Revenue" value={`£${totalRevenue.toLocaleString()}`} sub="Attributed to Pulse" />
        <MetricCard icon={Target} label="Revenue Signals" value={signals?.length ?? 0} />
        <MetricCard icon={TrendingUp} label="Top Source" value={sourceData[0]?.name || '—'} sub={sourceData[0] ? `£${sourceData[0].value}` : ''} />
        <MetricCard icon={BarChart3} label="Sources" value={sourceData.length} />
      </div>

      {sourceData.length > 0 ? (
        <Card className="card-elevated">
          <CardHeader className="pb-2"><CardTitle className="text-base font-sans font-medium">Revenue by Source</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" fill="hsl(42, 75%, 55%)" radius={[4, 4, 0, 0]} name="Revenue (£)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={DollarSign} title="No revenue data yet" description="Revenue signals will appear as your content drives engagement and bookings." />
      )}
    </div>
  );
}

/* ─── Campaign ROI Tab ─── */
function CampaignROITab() {
  const { currentVenue } = useVenue();
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaign-roi', currentVenue?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('copy_projects')
        .select('id, goal, module, created_at')
        .eq('venue_id', currentVenue!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  if (isLoading) return <div className="grid grid-cols-2 gap-4">{[1,2].map(i => <Card key={i} className="h-24 animate-pulse" />)}</div>;

  const byModule: Record<string, number> = {};
  campaigns?.forEach(c => { byModule[c.module] = (byModule[c.module] || 0) + 1; });
  const moduleData = Object.entries(byModule).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard icon={PenTool} label="Total Campaigns" value={campaigns?.length ?? 0} />
        <MetricCard icon={Target} label="Campaign Types" value={moduleData.length} />
        <MetricCard icon={TrendingUp} label="Most Used" value={moduleData[0]?.name || '—'} />
      </div>

      {moduleData.length > 0 ? (
        <Card className="card-elevated">
          <CardHeader className="pb-2"><CardTitle className="text-base font-sans font-medium">Campaigns by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={moduleData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {moduleData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center -mt-2">
                {moduleData.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="capitalize">{s.name}</span>
                    <span className="font-medium text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={PenTool} title="No campaigns yet" description="Create your first campaign to start tracking ROI." />
      )}
    </div>
  );
}

/* ─── Top Performing Content Tab ─── */
function TopContentTab() {
  const { currentVenue } = useVenue();
  const { data: signals, isLoading } = useQuery({
    queryKey: ['top-content-signals', currentVenue?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_signals')
        .select('*')
        .eq('venue_id', currentVenue!.id)
        .in('source_type', ['post', 'reel'])
        .order('revenue_estimate', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  if (isLoading) return <Card className="h-48 animate-pulse" />;

  if (!signals?.length) {
    return <EmptyState icon={Image} title="No content performance data" description="As your content generates engagement and revenue signals, top performers will appear here." />;
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2"><CardTitle className="text-base font-sans font-medium">Top Performing Content</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {signals.map((s, i) => {
            const engagement = s.engagement_metrics as Record<string, any> | null;
            return (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{i + 1}</span>
                <span className="flex-1 capitalize text-muted-foreground">{s.source_type}</span>
                {engagement?.likes && <span className="text-xs text-muted-foreground">{engagement.likes} likes</span>}
                <span className="font-medium">£{Number(s.revenue_estimate || 0).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Dish Marketing Performance Tab ─── */
function DishPerformanceTab() {
  const { currentVenue } = useVenue();
  const { data, isLoading } = useAnalyticsData();

  if (isLoading) return <Card className="h-48 animate-pulse" />;

  const typeData = data?.contentByType ?? [];

  if (!typeData.length) {
    return <EmptyState icon={UtensilsCrossed} title="No dish data yet" description="Upload and edit dish photos to start tracking per-dish marketing performance." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard icon={UtensilsCrossed} label="Content Types" value={typeData.length} />
        <MetricCard icon={Image} label="Total Items" value={typeData.reduce((s, d) => s + d.value, 0)} />
        <MetricCard icon={TrendingUp} label="Most Captured" value={typeData[0]?.name || '—'} />
      </div>
      <Card className="card-elevated">
        <CardHeader className="pb-2"><CardTitle className="text-base font-sans font-medium">Content by Type</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="hsl(145, 40%, 45%)" radius={[4, 4, 0, 0]} name="Items" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Overview Tab (original content) ─── */
function OverviewTab() {
  const { data, isLoading } = useAnalyticsData();

  const statusData = data
    ? Object.entries(data.contentByStatus).map(([name, value]) => ({ name, value }))
    : [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="card-elevated animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">No data available yet.</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard icon={Upload} label="Uploads" value={data.totalUploads} sub="Last 6 months" />
        <MetricCard icon={Image} label="Edited Assets" value={data.totalEditedAssets} />
        <MetricCard icon={FileText} label="Content Items" value={data.totalContentItems} />
        <MetricCard icon={PenTool} label="Copy Projects" value={data.totalCopyProjects} />
        <MetricCard icon={CalendarDays} label="Event Plans" value={data.totalEventPlans} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="card-elevated lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" /> Monthly Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.contentByMonth}>
                  <defs>
                    <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(42, 75%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(42, 75%, 55%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorEdits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(210, 50%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(210, 50%, 55%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCopy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(145, 40%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(145, 40%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'hsl(220, 10%, 95%)' }} />
                  <Area type="monotone" dataKey="uploads" stroke="hsl(42, 75%, 55%)" fill="url(#colorUploads)" strokeWidth={2} name="Uploads" />
                  <Area type="monotone" dataKey="edits" stroke="hsl(210, 50%, 55%)" fill="url(#colorEdits)" strokeWidth={2} name="Edits" />
                  <Area type="monotone" dataKey="copy" stroke="hsl(145, 40%, 45%)" fill="url(#colorCopy)" strokeWidth={2} name="Copy" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" /> Content Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center -mt-2">
                  {statusData.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="capitalize">{s.name}</span>
                      <span className="font-medium text-foreground">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No content items yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-elevated">
          <CardHeader className="pb-2"><CardTitle className="text-base font-sans font-medium">This Week</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyActivity}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="hsl(42, 75%, 55%)" radius={[4, 4, 0, 0]} name="Actions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-2"><CardTitle className="text-base font-sans font-medium">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {data.recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {data.recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={`status-chip text-[10px] ${
                      item.type === 'Upload' ? 'bg-accent/10 text-accent' :
                      item.type === 'Edit' ? 'bg-info/10 text-info' :
                      item.type === 'Copy' ? 'bg-success/10 text-success' :
                      'bg-warning/10 text-warning'
                    }`}>{item.type}</span>
                    <span className="flex-1 truncate text-muted-foreground">{item.title}</span>
                    <span className="text-xs text-muted-foreground/60 shrink-0">{new Date(item.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function BrandPerformancePage() {
  return (
    <>
      <PageHeader
        title="Brand Performance"
        description="Track your brand's content activity, revenue impact, and campaign performance."
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue Impact</TabsTrigger>
          <TabsTrigger value="content">Top Content</TabsTrigger>
          <TabsTrigger value="campaigns">Campaign ROI</TabsTrigger>
          <TabsTrigger value="dishes">Dish Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="revenue"><RevenueImpactTab /></TabsContent>
        <TabsContent value="content"><TopContentTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignROITab /></TabsContent>
        <TabsContent value="dishes"><DishPerformanceTab /></TabsContent>
      </Tabs>
    </>
  );
}
