import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Sparkles, 
  Image, 
  FileEdit, 
  Send, 
  ArrowUpRight,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';

interface BrandStats {
  uploads: number;
  drafts: number;
  approved: number;
  published: number;
}

export default function BrandOverviewPage() {
  const { currentVenue: currentBrand } = useVenue();
  const [stats, setStats] = useState<BrandStats>({ uploads: 0, drafts: 0, approved: 0, published: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentBrand) return;

    const fetchStats = async () => {
      try {
        const [uploadsResult, contentResult] = await Promise.all([
          supabase
            .from('uploads')
            .select('id', { count: 'exact', head: true })
            .eq('venue_id', currentBrand.id),
          supabase
            .from('content_items')
            .select('status')
            .eq('venue_id', currentBrand.id),
        ]);

        const drafts = contentResult.data?.filter(i => i.status === 'draft' || i.status === 'needs_changes').length || 0;
        const approved = contentResult.data?.filter(i => i.status === 'approved').length || 0;
        const published = contentResult.data?.filter(i => i.status === 'published').length || 0;

        setStats({
          uploads: uploadsResult.count || 0,
          drafts,
          approved,
          published,
        });
      } catch (error) {
        console.error('Error fetching brand stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentBrand]);

  const quickStats = [
    { label: 'Total Uploads', value: stats.uploads, icon: Image, color: 'text-accent' },
    { label: 'Pending Review', value: stats.drafts, icon: FileEdit, color: 'text-warning' },
    { label: 'Ready to Publish', value: stats.approved, icon: Send, color: 'text-success' },
    { label: 'Published', value: stats.published, icon: TrendingUp, color: 'text-info' },
  ];

  const quickActions = [
    { label: 'Brand Identity', description: 'Configure how your brand looks, sounds, and presents itself', href: '/brand/identity', icon: Sparkles },
    { label: 'Content Library', description: 'Access your uploaded and generated brand content', href: '/brand/library', icon: FileEdit },
    { label: 'TheEditor', description: 'Create hospitality-grade social content', href: '/studio/editor', icon: Image },
  ];

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-8"
      >
        <PageHeader
          title="Brand Overview"
          description="At-a-glance view of your brand's content and activity"
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {quickStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="card-elevated p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="text-3xl font-serif font-medium mb-1">{stat.value}</div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="font-serif text-xl font-medium">Quick Actions</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
              >
                <Link
                  to={action.href}
                  className="block card-elevated card-hover p-5 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
                      <action.icon className="w-5 h-5 text-accent" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
                  </div>
                  <h3 className="font-medium mb-1">{action.label}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Brand Health */}
        <div className="card-elevated p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-medium">Brand Health</h3>
              <p className="text-sm text-muted-foreground">Your brand is set up and ready to create content</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Brief</p>
              <p className="text-sm font-medium text-accent">Configured</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Assets</p>
              <p className="text-sm font-medium">{stats.uploads} uploaded</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">This Month</p>
              <p className="text-sm font-medium">{stats.published} published</p>
            </div>
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
}
