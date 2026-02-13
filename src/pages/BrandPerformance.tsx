import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalyticsData } from '@/hooks/use-analytics-data';
import { BarChart3, Upload, Image, PenTool, CalendarDays, FileText, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

const CHART_COLORS = [
  'hsl(42, 75%, 55%)',   // accent gold
  'hsl(210, 50%, 55%)',  // info blue
  'hsl(145, 40%, 45%)',  // success green
  'hsl(0, 62%, 55%)',    // destructive red
  'hsl(280, 50%, 55%)',  // purple
];

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
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

export default function BrandPerformancePage() {
  const { data, isLoading } = useAnalyticsData();

  const statusData = data
    ? Object.entries(data.contentByStatus).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <AppLayout>
      <PageHeader
        title="Brand Performance"
        description="Track your brand's content activity and output"
      />

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="card-elevated animate-pulse h-24" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-muted-foreground">No data available yet.</p>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard icon={Upload} label="Uploads" value={data.totalUploads} sub="Last 6 months" />
            <MetricCard icon={Image} label="Edited Assets" value={data.totalEditedAssets} />
            <MetricCard icon={FileText} label="Content Items" value={data.totalContentItems} />
            <MetricCard icon={PenTool} label="Copy Projects" value={data.totalCopyProjects} />
            <MetricCard icon={CalendarDays} label="Event Plans" value={data.totalEventPlans} />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Activity */}
            <Card className="card-elevated lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Monthly Activity
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
                      <Tooltip
                        contentStyle={{ background: 'hsl(220, 15%, 10%)', border: '1px solid hsl(220, 12%, 16%)', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: 'hsl(220, 10%, 95%)' }}
                      />
                      <Area type="monotone" dataKey="uploads" stroke="hsl(42, 75%, 55%)" fill="url(#colorUploads)" strokeWidth={2} name="Uploads" />
                      <Area type="monotone" dataKey="edits" stroke="hsl(210, 50%, 55%)" fill="url(#colorEdits)" strokeWidth={2} name="Edits" />
                      <Area type="monotone" dataKey="copy" stroke="hsl(145, 40%, 45%)" fill="url(#colorCopy)" strokeWidth={2} name="Copy" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Content Status */}
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  Content Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {statusData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'hsl(220, 15%, 10%)', border: '1px solid hsl(220, 12%, 16%)', borderRadius: 8, fontSize: 12 }} />
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

          {/* Weekly Activity + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium">This Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weeklyActivity}>
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: 'hsl(220, 15%, 10%)', border: '1px solid hsl(220, 12%, 16%)', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" fill="hsl(42, 75%, 55%)" radius={[4, 4, 0, 0]} name="Actions" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium">Recent Activity</CardTitle>
              </CardHeader>
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
                        <span className="text-xs text-muted-foreground/60 shrink-0">
                          {new Date(item.date).toLocaleDateString()}
                        </span>
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
      )}
    </AppLayout>
  );
}
