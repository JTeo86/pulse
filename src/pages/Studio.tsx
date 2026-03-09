import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Film, Sparkles, Clock, ArrowRight, ImagePlus, Palette, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

interface RecentCreation {
  id: string;
  type: 'photo' | 'reel';
  preview_url: string | null;
  created_at: string;
  status: string;
}

export default function Studio() {
  const { currentVenue } = useVenue();
  const navigate = useNavigate();
  const [recentCreations, setRecentCreations] = useState<RecentCreation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentVenue) return;
    
    const fetchRecent = async () => {
      try {
        const { data } = await supabase
          .from('editor_jobs')
          .select('id, mode, final_image_url, final_video_url, created_at, status')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(8);

        if (data) {
          setRecentCreations(data.map(job => ({
            id: job.id,
            type: job.mode === 'reel' ? 'reel' : 'photo',
            preview_url: job.final_image_url || job.final_video_url,
            created_at: job.created_at,
            status: job.status,
          })));
        }
      } catch (error) {
        console.error('Error fetching recent creations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecent();
  }, [currentVenue]);

  const creationTools = [
    {
      title: 'Pro Photo',
      description: 'Generate studio-quality photos of your dishes with AI-powered backgrounds',
      icon: Camera,
      href: '/studio/pro-photo',
      color: 'bg-blue-500/10 text-blue-500',
      primary: true,
    },
    {
      title: 'Reel Creator',
      description: 'Turn dish photos into engaging video content for social media',
      icon: Film,
      href: '/studio/reel-creator',
      color: 'bg-purple-500/10 text-purple-500',
      badge: 'Coming Soon',
    },
    {
      title: 'Style Engine',
      description: 'Train the AI to match your venue\'s unique visual identity',
      icon: Sparkles,
      href: '/studio/style-engine',
      color: 'bg-accent/10 text-accent',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <PageHeader
        title="Studio"
        description="Your creative workspace. Generate photos, create reels, and train your brand's visual style."
      />

      {/* Primary Creation Tools */}
      <div className="grid gap-4 md:grid-cols-3">
        {creationTools.map((tool, index) => (
          <motion.div
            key={tool.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Link to={tool.href} className="block h-full">
              <Card className={`
                h-full transition-all duration-200 hover:shadow-lg hover:border-accent/50
                ${tool.primary ? 'ring-2 ring-accent/20' : ''}
              `}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tool.color}`}>
                      <tool.icon className="w-6 h-6" />
                    </div>
                    {tool.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {tool.badge}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg mt-4">{tool.title}</CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm text-accent font-medium">
                    {tool.primary ? 'Start Creating' : 'Open'}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick Start */}
      <Card className="bg-gradient-to-br from-accent/5 to-transparent border-accent/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center">
                <ImagePlus className="w-7 h-7 text-accent" />
              </div>
              <div>
                <h3 className="font-medium text-lg">Ready to create?</h3>
                <p className="text-sm text-muted-foreground">
                  Upload a dish photo and generate professional content in seconds
                </p>
              </div>
            </div>
            <Button onClick={() => navigate('/studio/pro-photo')} className="shrink-0">
              <Camera className="w-4 h-4 mr-2" />
              Generate Photo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Creations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-medium">Recent Creations</h2>
          <Link to="/content/library" className="text-sm text-accent hover:underline flex items-center gap-1">
            View Library
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentCreations.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No creations yet"
            description="Your generated photos and reels will appear here"
            action={
              <Button onClick={() => navigate('/studio/pro-photo')} variant="outline" size="sm">
                <Camera className="w-4 h-4 mr-2" />
                Create Your First
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {recentCreations.map((creation) => (
              <motion.div
                key={creation.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group relative aspect-square rounded-lg overflow-hidden bg-muted border border-border"
              >
                {creation.preview_url ? (
                  <img
                    src={creation.preview_url}
                    alt="Creation preview"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {creation.type === 'reel' ? (
                      <Film className="w-8 h-8 text-muted-foreground" />
                    ) : (
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="flex items-center gap-2 text-white text-xs">
                      {creation.type === 'reel' ? (
                        <Film className="w-3 h-3" />
                      ) : (
                        <Camera className="w-3 h-3" />
                      )}
                      <span className="capitalize">{creation.type}</span>
                    </div>
                  </div>
                </div>
                {creation.status === 'processing' && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      Processing
                    </Badge>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Style Engine CTA */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Palette className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-medium">Train Your Visual Style</h3>
                <p className="text-sm text-muted-foreground">
                  Upload reference images to teach the AI your venue's unique look
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/studio/style-engine')}>
              <Sparkles className="w-4 h-4 mr-2" />
              Open Style Engine
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
