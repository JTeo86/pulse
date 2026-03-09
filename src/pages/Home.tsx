import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  MessageSquareText, 
  Calendar, 
  TrendingUp, 
  Image,
  ArrowRight,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ActionFeed } from '@/components/home/ActionFeed';

interface SnapshotData {
  reviewsAwaiting: number;
  contentScheduled: number;
  styleReferences: number;
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: 'image_generated' | 'review_responded' | 'content_scheduled' | 'style_uploaded';
  title: string;
  timestamp: string;
}

interface ActionItem {
  id: string;
  action_type: string;
  priority: string;
  title: string;
  description: string;
  cta_label: string;
  cta_route: string;
  status: string;
  created_at: string;
}

export default function Home() {
  const { currentVenue } = useVenue();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SnapshotData>({
    reviewsAwaiting: 0,
    contentScheduled: 0,
    styleReferences: 0,
    recentActivity: [],
  });
  const [actions, setActions] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (!currentVenue) return;

    const fetchData = async () => {
      setLoading(true);
      
      try {
        const [reviewsRes, scheduledRes, styleRes, recentEditsRes, actionItemsRes] = await Promise.all([
          supabase
            .from('review_response_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('venue_id', currentVenue.id)
            .eq('status', 'pending'),
          supabase
            .from('content_items')
            .select('*', { count: 'exact', head: true })
            .eq('venue_id', currentVenue.id)
            .eq('status', 'scheduled'),
          supabase
            .from('style_reference_assets')
            .select('*', { count: 'exact', head: true })
            .eq('venue_id', currentVenue.id)
            .eq('status', 'analyzed'),
          supabase
            .from('edited_assets')
            .select('id, created_at')
            .eq('venue_id', currentVenue.id)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('action_feed_items')
            .select('*')
            .eq('venue_id', currentVenue.id)
            .eq('status', 'open')
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false })
            .limit(6),
        ]);

        const recentActivity: ActivityItem[] = (recentEditsRes.data || []).map((edit) => ({
          id: edit.id,
          type: 'image_generated' as const,
          title: 'Pro Photo generated',
          timestamp: edit.created_at,
        }));

        setSnapshot({
          reviewsAwaiting: reviewsRes.count || 0,
          contentScheduled: scheduledRes.count || 0,
          styleReferences: styleRes.count || 0,
          recentActivity,
        });

        setActions((actionItemsRes.data as ActionItem[]) || []);
      } catch (error) {
        console.error('Error fetching home data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentVenue]);

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <PageHeader
        title={`Welcome back${currentVenue ? `, ${currentVenue.name}` : ''}`}
        description="Your venue command center — see what needs attention and take action."
      />

      {/* Snapshot Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SnapshotCard
          icon={MessageSquareText}
          label="Reviews Awaiting"
          value={snapshot.reviewsAwaiting}
          href="/reputation/reviews"
          loading={loading}
          variant={snapshot.reviewsAwaiting > 0 ? 'warning' : 'default'}
        />
        <SnapshotCard
          icon={Calendar}
          label="Content Scheduled"
          value={snapshot.contentScheduled}
          href="/content/scheduler"
          loading={loading}
        />
        <SnapshotCard
          icon={Image}
          label="Style References"
          value={snapshot.styleReferences}
          href="/studio/style-engine"
          loading={loading}
        />
        <SnapshotCard
          icon={TrendingUp}
          label="This Week"
          value="View Insights"
          href="/growth/performance"
          loading={loading}
          isLink
        />
      </section>

      {/* Action Feed */}
      <ActionFeed actions={actions} loading={loading} onActionsChange={setActions} />

      {/* Recent Activity */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          Recent Activity
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : snapshot.recentActivity.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No recent activity yet. Start creating content!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {snapshot.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border"
              >
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                  <Image className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeAgo(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
}

function SnapshotCard({
  icon: Icon,
  label,
  value,
  href,
  loading,
  variant = 'default',
  isLink = false,
}: {
  icon: any;
  label: string;
  value: number | string;
  href: string;
  loading: boolean;
  variant?: 'default' | 'warning';
  isLink?: boolean;
}) {
  return (
    <Link to={href}>
      <Card className={`group hover:border-accent/50 transition-colors cursor-pointer ${
        variant === 'warning' && typeof value === 'number' && value > 0 
          ? 'border-amber-500/30 bg-amber-500/5' 
          : ''
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <Icon className={`w-5 h-5 ${
              variant === 'warning' && typeof value === 'number' && value > 0 
                ? 'text-amber-500' 
                : 'text-muted-foreground'
            }`} />
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className={`text-2xl font-bold ${isLink ? 'text-accent text-base' : ''}`}>
              {value}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
