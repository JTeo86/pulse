import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileEdit, Check, X, RefreshCw, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface ContentItem {
  id: string;
  intent: string;
  caption_draft: string | null;
  media_master_url: string | null;
  status: 'draft' | 'needs_changes';
  change_reason: string | null;
  created_at: string;
}

export default function DraftsTab() {
  const { currentVenue, isAdmin } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!currentVenue) return;

    const fetchDrafts = async () => {
      try {
        const { data, error } = await supabase
          .from('content_items')
          .select('*')
          .eq('venue_id', currentVenue.id)
          .in('status', ['draft', 'needs_changes'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        setItems((data || []) as ContentItem[]);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading drafts',
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDrafts();
  }, [currentVenue, toast]);

  const openReview = (item: ContentItem) => {
    setSelectedItem(item);
    setEditedCaption(item.caption_draft || '');
  };

  const handleApprove = async () => {
    if (!selectedItem || !isAdmin || !user) return;

    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from('content_items')
        .update({ 
          status: 'approved',
          caption_final: editedCaption,
        })
        .eq('id', selectedItem.id);

      if (updateError) throw updateError;

      await supabase.from('audit_log').insert({
        venue_id: currentVenue!.id,
        user_id: user.id,
        action: 'approve',
        entity_type: 'content_item',
        entity_id: selectedItem.id,
      });

      toast({ title: 'Content approved' });
      setItems(prev => prev.filter(i => i.id !== selectedItem.id));
      setSelectedItem(null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error approving content',
        description: error.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedItem || !isAdmin || !user || !changeReason.trim()) return;

    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from('content_items')
        .update({ 
          status: 'needs_changes',
          change_reason: changeReason,
        })
        .eq('id', selectedItem.id);

      if (updateError) throw updateError;

      await supabase.from('audit_log').insert({
        venue_id: currentVenue!.id,
        user_id: user.id,
        action: 'request_changes',
        entity_type: 'content_item',
        entity_id: selectedItem.id,
        meta: { reason: changeReason },
      });

      toast({ title: 'Changes requested' });
      setItems(prev => prev.map(i => 
        i.id === selectedItem.id ? { ...i, status: 'needs_changes' as const, change_reason: changeReason } : i
      ));
      setSelectedItem(null);
      setShowRejectDialog(false);
      setChangeReason('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error requesting changes',
        description: error.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No drafts to review"
          description="When AI generates content from your uploads, it will appear here for approval."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="card-elevated card-hover overflow-hidden cursor-pointer"
              onClick={() => openReview(item)}
            >
              <div className="aspect-video bg-muted flex items-center justify-center">
                {item.media_master_url ? (
                  <img 
                    src={item.media_master_url} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Image className="w-12 h-12 text-muted-foreground/30" />
                )}
              </div>
              
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">{item.intent}</span>
                  <StatusBadge status={item.status} />
                </div>
                
                <p className="text-sm line-clamp-3">
                  {item.caption_draft || 'Caption pending...'}
                </p>

                {item.change_reason && (
                  <div className="p-2 bg-warning/10 rounded text-xs text-warning">
                    {item.change_reason}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Content</DialogTitle>
            <DialogDescription>
              Review and edit the AI-generated content before approving
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              {selectedItem?.media_master_url ? (
                <img 
                  src={selectedItem.media_master_url} 
                  alt="" 
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Image className="w-16 h-16 mx-auto mb-2" />
                  <p>Media preview will appear here</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Caption</label>
              <Textarea
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
                className="min-h-[100px] input-editorial"
                placeholder="Edit the caption..."
                disabled={!isAdmin}
              />
            </div>

            {selectedItem?.change_reason && (
              <div className="p-3 bg-warning/10 rounded-lg text-sm">
                <strong>Previous feedback:</strong> {selectedItem.change_reason}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={processing}
                >
                  <X className="w-4 h-4 mr-2" />
                  Request Changes
                </Button>
                <Button
                  variant="outline"
                  disabled={processing}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={processing}
                  className="btn-primary-editorial"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Provide feedback for the AI to improve this content
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder="What needs to be changed?"
            className="min-h-[100px] input-editorial"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequestChanges}
              disabled={!changeReason.trim() || processing}
              className="btn-primary-editorial"
            >
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
