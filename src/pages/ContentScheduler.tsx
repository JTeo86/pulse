import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Image, Trash2, CheckSquare, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { CalendarContentCard, type ScheduledItem } from '@/components/calendar/CalendarContentCard';
import { CreateCalendarItemDialog } from '@/components/calendar/CreateCalendarItemDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ContentScheduler() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchScheduled = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);

    // Query content_items and join plan_publish_items to get the plan_id for campaign routing
    const { data } = await supabase
      .from('content_items')
      .select(`
        id, caption_final, caption_draft, media_master_url, scheduled_for,
        status, intent, created_at, source_plan_publish_item_id, source_plan_title,
        plan_publish_items!content_items_source_plan_publish_item_id_fkey ( plan_id )
      `)
      .eq('venue_id', currentVenue.id)
      .in('status', ['scheduled', 'draft', 'published'])
      .order('scheduled_for', { ascending: true, nullsFirst: false });

    const mapped: ScheduledItem[] = (data || []).map((row: any) => ({
      id: row.id,
      caption_final: row.caption_final,
      caption_draft: row.caption_draft,
      media_master_url: row.media_master_url,
      scheduled_for: row.scheduled_for,
      status: row.status,
      intent: row.intent,
      created_at: row.created_at,
      source_plan_publish_item_id: row.source_plan_publish_item_id,
      source_plan_title: row.source_plan_title,
      source_plan_id: row.plan_publish_items?.plan_id || null,
    }));

    setItems(mapped);
    setLoading(false);
  }, [currentVenue]);

  useEffect(() => { fetchScheduled(); }, [fetchScheduled]);

  // Reset selection when leaving selection mode
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  const handleDelete = async (item: ScheduledItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });

    const { error } = await supabase
      .from('content_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to delete', description: error.message });
      fetchScheduled();
      return;
    }

    // Reset linked Post Pack if campaign-linked
    if (item.source_plan_publish_item_id) {
      await resetLinkedPostPack(item.source_plan_publish_item_id);
    }

    toast({ title: 'Removed from calendar' });
  };

  /** Reset a linked post pack: clear its calendar_item_id and set status back to ready */
  const resetLinkedPostPack = async (publishItemId: string) => {
    const { data: packData, error: packError } = await supabase
      .from('plan_publish_items')
      .select('metadata')
      .eq('id', publishItemId)
      .single();

    if (packError) return; // Pack may have been deleted

    const meta = { ...((packData?.metadata as Record<string, any>) || {}) };
    delete meta.calendar_item_id;

    await supabase
      .from('plan_publish_items')
      .update({ status: 'ready', metadata: meta } as any)
      .eq('id', publishItemId);
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    const itemsToDelete = items.filter(i => idsToDelete.includes(i.id));

    // Optimistic UI update
    setItems(prev => prev.filter(i => !idsToDelete.includes(i.id)));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    setSelectionMode(false);

    // Delete all content_items
    const { error } = await supabase
      .from('content_items')
      .delete()
      .in('id', idsToDelete);

    if (error) {
      toast({ variant: 'destructive', title: 'Bulk delete failed', description: error.message });
      fetchScheduled();
      return;
    }

    // Reset linked Post Packs for campaign items
    const linkedPackIds = itemsToDelete
      .map(i => i.source_plan_publish_item_id)
      .filter((id): id is string => !!id);

    for (const packId of linkedPackIds) {
      await resetLinkedPostPack(packId);
    }

    toast({ title: `Deleted ${idsToDelete.length} item${idsToDelete.length > 1 ? 's' : ''}` });
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const scheduledItems = items.filter((i) => i.status === 'scheduled' && i.scheduled_for);
  const draftItems = items.filter((i) => i.status === 'draft');
  const publishedItems = items.filter((i) => i.status === 'published');

  const selectableItems = [...scheduledItems, ...publishedItems];
  const allSelectableSelected = selectableItems.length > 0 && selectableItems.every(i => selectedIds.has(i.id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map(i => i.id)));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Content Calendar"
          description="Manage all scheduled and draft posts for your venue — including campaign posts and one-off content."
        />
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Create
          </Button>
          {items.length > 0 && (
            <>

            {selectionMode ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={toggleSelectAll}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {allSelectableSelected ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 text-xs"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete ({selectedIds.size})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setSelectionMode(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => setSelectionMode(true)}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Select
              </Button>
            )}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No content on your calendar"
          description="Create a one-off post or build Post Packs in the Planner to populate your calendar."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Create Post
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {scheduledItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                Scheduled ({scheduledItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {scheduledItems.map((item) => (
                  <CalendarContentCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item)}
                    selectable={selectionMode}
                    selected={selectedIds.has(item.id)}
                    onSelectChange={(checked) => toggleSelect(item.id, checked)}
                  />
                ))}
              </div>
            </section>
          )}

          {draftItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Image className="w-5 h-5 text-muted-foreground" />
                Drafts ({draftItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {draftItems.map((item) => (
                  <CalendarContentCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {publishedItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-success" />
                Published ({publishedItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publishedItems.map((item) => (
                  <CalendarContentCard
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item)}
                    selectable={selectionMode}
                    selected={selectedIds.has(item.id)}
                    onSelectChange={(checked) => toggleSelect(item.id, checked)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected items from your Content Calendar.
              {Array.from(selectedIds).some(id => items.find(i => i.id === id)?.source_plan_publish_item_id) && (
                <> Campaign-linked items will be unlinked from the calendar but the campaign plan will remain intact.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Delete {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
