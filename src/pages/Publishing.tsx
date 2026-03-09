import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Clock, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface ContentItem {
  id: string;
  intent: string;
  caption_final: string | null;
  media_master_url: string | null;
  status: 'approved' | 'sent_to_buffer' | 'scheduled' | 'published' | 'failed';
  scheduled_for: string | null;
  created_at: string;
}

export default function PublishingPage() {
  const { currentVenue, isAdmin } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!currentVenue) return;

    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('content_items')
          .select('*')
          .eq('venue_id', currentVenue.id)
          .in('status', ['approved', 'sent_to_buffer', 'scheduled', 'published', 'failed'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        setItems((data || []) as ContentItem[]);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading content',
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [currentVenue, toast]);

  const handleSendToBuffer = async (item: ContentItem) => {
    if (!isAdmin || !user) return;

    setSending(item.id);
    try {
      // Update status to sent_to_buffer
      const { error } = await supabase
        .from('content_items')
        .update({ status: 'sent_to_buffer' })
        .eq('id', item.id);

      if (error) throw error;

      // Add audit log
      await supabase.from('audit_log').insert({
        venue_id: currentVenue!.id,
        user_id: user.id,
        action: 'send_to_buffer',
        entity_type: 'content_item',
        entity_id: item.id,
      });

      toast({ title: 'Sent to Buffer' });
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, status: 'sent_to_buffer' as const } : i
      ));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error sending to Buffer',
        description: error.message,
      });
    } finally {
      setSending(null);
    }
  };

  const approvedItems = items.filter(i => i.status === 'approved');
  const queuedItems = items.filter(i => ['sent_to_buffer', 'scheduled'].includes(i.status));
  const publishedItems = items.filter(i => i.status === 'published');

  const ContentCard = ({ item }: { item: ContentItem }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-elevated p-4"
    >
      <div className="flex gap-4">
        <div className="w-24 h-24 bg-muted rounded-lg flex-shrink-0 overflow-hidden">
          {item.media_master_url ? (
            <img 
              src={item.media_master_url} 
              alt="" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Clock className="w-6 h-6" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground capitalize">{item.intent}</span>
            <StatusBadge status={item.status} />
          </div>
          
          <p className="text-sm line-clamp-2 mb-3">
            {item.caption_final || 'No caption'}
          </p>

          {isAdmin && item.status === 'approved' && (
            <Button
              size="sm"
              onClick={() => handleSendToBuffer(item)}
              disabled={sending === item.id}
              className="btn-primary-editorial"
            >
              {sending === item.id ? (
                <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-3 h-3 mr-1" />
                  Send to Buffer
                </>
              )}
            </Button>
          )}

          {item.scheduled_for && (
            <p className="text-xs text-muted-foreground mt-2">
              Scheduled: {new Date(item.scheduled_for).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );

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
      >
        <PageHeader
          title="Publishing"
          description="Manage approved content and publishing queue"
        />

        <Tabs defaultValue="approved" className="space-y-6">
          <TabsList>
            <TabsTrigger value="approved" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Ready ({approvedItems.length})
            </TabsTrigger>
            <TabsTrigger value="queued" className="gap-2">
              <Clock className="w-4 h-4" />
              Queued ({queuedItems.length})
            </TabsTrigger>
            <TabsTrigger value="published" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Published ({publishedItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="approved">
            {approvedItems.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No approved content"
                description="Approve content from the Drafts page to see it here"
              />
            ) : (
              <div className="space-y-4">
                {approvedItems.map(item => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="queued">
            {queuedItems.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Nothing in queue"
                description="Content sent to Buffer will appear here"
              />
            ) : (
              <div className="space-y-4">
                {queuedItems.map(item => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="published">
            {publishedItems.length === 0 ? (
              <EmptyState
                icon={ExternalLink}
                title="No published content yet"
                description="Published content will appear here"
              />
            ) : (
              <div className="space-y-4">
                {publishedItems.map(item => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
