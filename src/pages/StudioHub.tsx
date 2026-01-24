import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  Mail, 
  FileText, 
  Megaphone, 
  MessageSquare,
  Calendar,
  ExternalLink,
  ArrowRight
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const futureModules = [
  {
    title: 'Email Campaigns',
    description: 'Design beautiful emails that match your brand identity',
    icon: Mail,
    status: 'Coming Soon'
  },
  {
    title: 'Blog Posts',
    description: 'Generate SEO-optimized blog content in your brand voice',
    icon: FileText,
    status: 'Coming Soon'
  },
  {
    title: 'Ad Creative',
    description: 'Create compelling ad copy and visuals for any platform',
    icon: Megaphone,
    status: 'Coming Soon'
  },
  {
    title: 'SMS Campaigns',
    description: 'Craft concise, impactful messages for mobile audiences',
    icon: MessageSquare,
    status: 'Coming Soon'
  }
];

export default function StudioHubPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <PageHeader
        title="Studio Hub"
        description="Your creative command center for brand-consistent content"
      />

      <div className="space-y-8">
        {/* Active Module - TheEditor */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="card-elevated border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-accent/10">
                    <Sparkles className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">TheEditor</CardTitle>
                    <CardDescription>Hospitality-Grade Social Content Engine</CardDescription>
                  </div>
                </div>
                <Badge className="bg-accent/20 text-accent border-accent/30">Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Transform raw photos into scroll-stopping social content. TheEditor uses your Brand Identity 
                to generate on-brand visuals and captions optimized for hospitality businesses.
              </p>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="px-2 py-1 rounded-md bg-muted/50">AI-Enhanced Imagery</span>
                <span className="px-2 py-1 rounded-md bg-muted/50">Brand Voice Captions</span>
                <span className="px-2 py-1 rounded-md bg-muted/50">Multi-Platform Export</span>
                <span className="px-2 py-1 rounded-md bg-muted/50">Buffer Integration</span>
              </div>
              <Button 
                onClick={() => navigate('/studio/editor')}
                className="btn-accent gap-2"
              >
                Open TheEditor
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Future Modules */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h2 className="heading-section mb-4">Coming to Studio</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {futureModules.map((module) => (
              <Card key={module.title} className="card-elevated opacity-60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted/50">
                        <module.icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <CardTitle className="text-base">{module.title}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {module.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{module.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Scheduling Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="card-elevated">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted/50">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Scheduling & Publishing</CardTitle>
                  <CardDescription>How to get your content live</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For V1, we integrate with external schedulers to give you maximum flexibility:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Buffer Integration
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Connect Buffer in Integrations to schedule posts directly from TheEditor's publishing tab.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate('/settings/integrations')}
                  >
                    Configure Integrations
                  </Button>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                  <h4 className="font-medium mb-2">Manual Publishing</h4>
                  <p className="text-sm text-muted-foreground">
                    Download your approved content and post directly to your social platforms whenever you're ready.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
}
