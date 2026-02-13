import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalyticsData } from '@/hooks/use-analytics-data';
import { useVenue } from '@/lib/venue-context';
import { Target, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, ArrowUpRight } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

// Derive competitive scores from real activity
function deriveScores(data: any) {
  const uploads = Math.min(data.totalUploads * 10, 100);
  const editing = Math.min(data.totalEditedAssets * 15, 100);
  const copy = Math.min(data.totalCopyProjects * 20, 100);
  const events = Math.min(data.totalEventPlans * 12, 100);
  const content = Math.min(data.totalContentItems * 8, 100);
  const overall = Math.round((uploads + editing + copy + events + content) / 5);

  return {
    overall,
    radarData: [
      { metric: 'Visual Content', score: uploads, benchmark: 65 },
      { metric: 'Editing', score: editing, benchmark: 50 },
      { metric: 'Copywriting', score: copy, benchmark: 45 },
      { metric: 'Events', score: events, benchmark: 55 },
      { metric: 'Publishing', score: content, benchmark: 60 },
    ],
    gaps: [
      { area: 'Visual Content', yours: uploads, industry: 65, diff: uploads - 65 },
      { area: 'Editing Pipeline', yours: editing, industry: 50, diff: editing - 50 },
      { area: 'Copy Production', yours: copy, industry: 45, diff: copy - 45 },
      { area: 'Event Marketing', yours: events, industry: 55, diff: events - 55 },
      { area: 'Content Output', yours: content, industry: 60, diff: content - 60 },
    ],
  };
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-destructive';
  return (
    <div className="text-center">
      <p className={`text-3xl font-semibold font-sans ${color}`}>{score}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function TrendIcon({ diff }: { diff: number }) {
  if (diff > 10) return <TrendingUp className="w-4 h-4 text-success" />;
  if (diff < -10) return <TrendingDown className="w-4 h-4 text-destructive" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

export default function CompetitorIntelPage() {
  const { data, isLoading } = useAnalyticsData();
  const { currentVenue } = useVenue();

  const scores = data ? deriveScores(data) : null;

  const opportunities = scores
    ? scores.gaps
        .filter(g => g.diff < 0)
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 3)
    : [];

  const strengths = scores
    ? scores.gaps
        .filter(g => g.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3)
    : [];

  return (
    <AppLayout>
      <PageHeader
        title="Competitor Intel"
        description="See how your brand activity compares to industry benchmarks"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="card-elevated animate-pulse h-48" />
          ))}
        </div>
      ) : !scores ? (
        <p className="text-muted-foreground">No data available yet.</p>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Score Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="card-elevated md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
                  <Target className="w-4 h-4 text-accent" />
                  Brand Activity Score
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(220, 12%, 16%)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="hsl(42, 75%, 55%)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(scores.overall / 100) * 264} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-semibold font-sans">{scores.overall}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  {scores.overall >= 70 ? 'Strong performer' : scores.overall >= 40 ? 'Growing steadily' : 'Getting started'}
                </p>
              </CardContent>
            </Card>

            <Card className="card-elevated md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium">You vs. Industry Benchmark</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={scores.radarData}>
                      <PolarGrid stroke="hsl(220, 12%, 16%)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} />
                      <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                      <Radar name={currentVenue?.name || 'You'} dataKey="score" stroke="hsl(42, 75%, 55%)" fill="hsl(42, 75%, 55%)" fillOpacity={0.2} strokeWidth={2} />
                      <Radar name="Benchmark" dataKey="benchmark" stroke="hsl(220, 8%, 55%)" fill="hsl(220, 8%, 55%)" fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" />
                      <Tooltip contentStyle={{ background: 'hsl(220, 15%, 10%)', border: '1px solid hsl(220, 12%, 16%)', borderRadius: 8, fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gap Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Opportunities to Improve
                </CardTitle>
              </CardHeader>
              <CardContent>
                {opportunities.length > 0 ? (
                  <div className="space-y-4">
                    {opportunities.map((gap) => (
                      <div key={gap.area} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <TrendIcon diff={gap.diff} />
                          <div>
                            <p className="text-sm font-medium">{gap.area}</p>
                            <p className="text-xs text-muted-foreground">
                              Your score: {gap.yours} · Benchmark: {gap.industry}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-mono text-destructive">{gap.diff}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <ArrowUpRight className="w-8 h-8 text-success mb-2" />
                    <p className="text-sm text-muted-foreground">You're outperforming benchmarks across the board!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-sans font-medium flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-accent" />
                  Your Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                {strengths.length > 0 ? (
                  <div className="space-y-4">
                    {strengths.map((s) => (
                      <div key={s.area} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <TrendIcon diff={s.diff} />
                          <div>
                            <p className="text-sm font-medium">{s.area}</p>
                            <p className="text-xs text-muted-foreground">
                              Your score: {s.yours} · Benchmark: {s.industry}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-mono text-success">+{s.diff}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-warning mb-2" />
                    <p className="text-sm text-muted-foreground">Start creating content to build your strengths</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Benchmark Comparison Bar */}
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-sans font-medium">Detailed Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scores.gaps} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="area" tick={{ fontSize: 11, fill: 'hsl(220, 8%, 55%)' }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip contentStyle={{ background: 'hsl(220, 15%, 10%)', border: '1px solid hsl(220, 12%, 16%)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="yours" fill="hsl(42, 75%, 55%)" radius={[0, 4, 4, 0]} name="Your Score" barSize={12} />
                    <Bar dataKey="industry" fill="hsl(220, 12%, 25%)" radius={[0, 4, 4, 0]} name="Benchmark" barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
