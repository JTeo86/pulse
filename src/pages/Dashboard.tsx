import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileEdit, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface DashboardStats {
  uploads: number;
  drafts: number;
  approved: number;
  published: number;
}

export default function DashboardPage() {
  const { currentVenue, isAdmin } = useVenue();
  const [stats, setStats] = useState<DashboardStats>({
    uploads: 0,
    drafts: 0,
    approved: 0,
    published: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentVenue) return;

    const fetchStats = async () => {
      try {
        // Get uploads count
        const { count: uploadsCount } = await supabase
          .from('uploads')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', currentVenue.id);

        // Get content items by status
        const { data: contentItems } = await supabase
          .from('content_items')
          .select('status')
          .eq('venue_id', currentVenue.id);

        const drafts = contentItems?.filter(c => c.status === 'draft' || c.status === 'needs_changes').length || 0;
        const approved = contentItems?.filter(c => c.status === 'approved' || c.status === 'sent_to_buffer').length || 0;
        const published = contentItems?.filter(c => c.status === 'published').length || 0;

        setStats({
          uploads: uploadsCount || 0,
          drafts,
          approved,
          published,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentVenue]);

  const statCards = [
    { label: 'Uploads', value: stats.uploads, icon: Upload, href: '/upload' },
    { label: 'Drafts to Review', value: stats.drafts, icon: FileEdit, href: '/drafts' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, href: '/publishing' },
    { label: 'Published', value: stats.published, icon: Clock, href: '/publishing' },
  ];

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <PageHeader
          title={`Welcome back${currentVenue ? `, ${currentVenue.name}` : ''}`}
          description="Here's an overview of your content pipeline"
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Link
                to={stat.href}
                className="card-elevated card-hover p-6 flex flex-col h-full"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-accent" />
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="text-3xl font-serif font-medium">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="card-elevated p-6">
          <h2 className="font-medium mb-4">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="btn-primary-editorial">
              <Link to="/upload">
                <Upload className="w-4 h-4 mr-2" />
                Upload photos
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/drafts">
                <FileEdit className="w-4 h-4 mr-2" />
                Review drafts
              </Link>
            </Button>
            {isAdmin && (
              <Button asChild variant="outline">
                <Link to="/brand-kit">
                  Configure brand kit
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Workflow Explanation */}
        <div className="mt-8 p-6 bg-muted/50 rounded-lg border border-border">
          <h3 className="font-medium mb-3">How it works</h3>
          <div className="grid md:grid-cols-4 gap-6 text-sm">
            <div>
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mb-2 text-accent font-medium">1</div>
              <p className="text-muted-foreground">Staff uploads photos from the venue</p>
            </div>
            <div>
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mb-2 text-accent font-medium">2</div>
              <p className="text-muted-foreground">AI generates brand-consistent content</p>
            </div>
            <div>
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mb-2 text-accent font-medium">3</div>
              <p className="text-muted-foreground">Admin reviews and approves drafts</p>
            </div>
            <div>
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center mb-2 text-accent font-medium">4</div>
              <p className="text-muted-foreground">Approved content is sent to Buffer</p>
            </div>
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
}
