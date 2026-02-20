import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalyticsData } from '@/hooks/use-analytics-data';
import { Brain, Sparkles, ArrowRight, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Insight {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  icon: any;
}

function generateInsights(data: any): Insight[] {
  const insights: Insight[] = [];

  // Content production insights
  if (data.totalUploads === 0) {
    insights.push({
      title: 'Start uploading content',
      description: 'Upload your first photos to begin building your visual content library. Consistent visual content is key to brand recognition.',
      priority: 'high',
      category: 'Content',
      icon: AlertCircle,
    });
  } else if (data.totalUploads < 5) {
    insights.push({
      title: 'Build your content library',
      description: `You have ${data.totalUploads} uploads. Brands with 20+ assets see 3x more engagement. Keep uploading to build a diverse library.`,
      priority: 'medium',
      category: 'Content',
      icon: Zap,
    });
  } else {
    insights.push({
      title: 'Strong visual library',
      description: `With ${data.totalUploads} uploads, you have a solid visual foundation. Focus on variety — mix product shots, lifestyle imagery, and behind-the-scenes content.`,
      priority: 'low',
      category: 'Content',
      icon: CheckCircle2,
    });
  }

  // Editing pipeline insights
  if (data.totalEditedAssets === 0 && data.totalUploads > 0) {
    insights.push({
      title: 'Use TheEditor to polish content',
      description: 'You have uploads but no edited assets. Use TheEditor to remove backgrounds, add brand overlays, and create consistent visual styling.',
      priority: 'high',
      category: 'Editing',
      icon: AlertCircle,
    });
  } else if (data.totalEditedAssets > 0) {
    const editRate = Math.round((data.totalEditedAssets / Math.max(data.totalUploads, 1)) * 100);
    insights.push({
      title: editRate > 50 ? 'Great editing workflow' : 'Edit more of your uploads',
      description: `${editRate}% of your uploads have been edited. ${editRate > 50 ? 'Your editing pipeline is strong.' : 'Try editing more uploads for a consistent brand look.'}`,
      priority: editRate > 50 ? 'low' : 'medium',
      category: 'Editing',
      icon: editRate > 50 ? CheckCircle2 : Zap,
    });
  }

  // Copy production insights
  if (data.totalCopyProjects === 0) {
    insights.push({
      title: 'Generate your first copy',
      description: 'Use the AI Copywriter to create captions, social posts, and marketing copy that matches your brand voice.',
      priority: 'medium',
      category: 'Copy',
      icon: Clock,
    });
  } else {
    insights.push({
      title: `${data.totalCopyProjects} copy projects created`,
      description: 'Keep using the Copywriter for consistent brand messaging. Try different modules like social captions, email subject lines, and event announcements.',
      priority: 'low',
      category: 'Copy',
      icon: CheckCircle2,
    });
  }

  // Event planning insights
  if (data.totalEventPlans === 0) {
    insights.push({
      title: 'Plan your first campaign',
      description: 'The Events Planner helps you prepare marketing campaigns around holidays and events. Sync events and start planning ahead.',
      priority: 'medium',
      category: 'Events',
      icon: Clock,
    });
  } else {
    insights.push({
      title: `${data.totalEventPlans} event plans active`,
      description: 'Great job planning ahead! Review your upcoming event plans to ensure all content and copy is ready before launch.',
      priority: 'low',
      category: 'Events',
      icon: CheckCircle2,
    });
  }

  // Content status insights
  const draftCount = data.contentByStatus['draft'] || 0;
  const publishedCount = data.contentByStatus['published'] || 0;
  if (draftCount > 3 && publishedCount === 0) {
    insights.push({
      title: 'Move drafts to published',
      description: `You have ${draftCount} drafts sitting idle. Review and publish them to maintain a consistent posting cadence.`,
      priority: 'high',
      category: 'Publishing',
      icon: AlertCircle,
    });
  }

  // Monthly trend insights
  const lastMonth = data.contentByMonth[data.contentByMonth.length - 1];
  const prevMonth = data.contentByMonth[data.contentByMonth.length - 2];
  if (lastMonth && prevMonth) {
    const lastTotal = lastMonth.uploads + lastMonth.edits + lastMonth.copy;
    const prevTotal = prevMonth.uploads + prevMonth.edits + prevMonth.copy;
    if (lastTotal > prevTotal) {
      insights.push({
        title: 'Activity is trending up',
        description: `Your content production increased from ${prevTotal} to ${lastTotal} actions this month. Keep the momentum going!`,
        priority: 'low',
        category: 'Trend',
        icon: Sparkles,
      });
    } else if (lastTotal < prevTotal && prevTotal > 0) {
      insights.push({
        title: 'Activity dipped this month',
        description: `Content production dropped from ${prevTotal} to ${lastTotal} this month. Schedule some time to create and edit content.`,
        priority: 'medium',
        category: 'Trend',
        icon: Zap,
      });
    }
  }

  return insights.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

const priorityStyles = {
  high: 'border-l-destructive',
  medium: 'border-l-warning',
  low: 'border-l-success',
};

const priorityBadge = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  low: 'bg-success/10 text-success border-success/20',
};

export default function AIInsightsPage() {
  const { data, isLoading } = useAnalyticsData();
  const insights = data ? generateInsights(data) : [];

  const highCount = insights.filter(i => i.priority === 'high').length;
  const mediumCount = insights.filter(i => i.priority === 'medium').length;

  return (
    <>
      <PageHeader
        title="AI Insights"
        description="Smart recommendations based on your brand activity"
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="card-elevated animate-pulse h-24" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-muted-foreground">No data available yet.</p>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="card-elevated">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-sans">{insights.length}</p>
                  <p className="text-xs text-muted-foreground">Total Insights</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-sans">{highCount}</p>
                  <p className="text-xs text-muted-foreground">High Priority</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-semibold font-sans">{mediumCount}</p>
                  <p className="text-xs text-muted-foreground">Medium Priority</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Insights List */}
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <Card key={i} className={`card-elevated border-l-4 ${priorityStyles[insight.priority]}`}>
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <insight.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium font-sans">{insight.title}</h3>
                      <Badge variant="outline" className={`text-[10px] ${priorityBadge[insight.priority]}`}>
                        {insight.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {insight.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
