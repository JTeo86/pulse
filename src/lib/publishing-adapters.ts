export type PublishingQueueStatus =
  | 'approved'
  | 'ready'
  | 'queued'
  | 'scheduled'
  | 'exported'
  | 'published'
  | 'failed'
  | 'sent_to_buffer';

export type PublishingQueueViewStatus = 'ready' | 'queued' | 'scheduled' | 'exported' | 'published' | 'failed';

export type PublishingAction = 'add_to_queue' | 'set_scheduled_time' | 'mark_exported' | 'mark_published' | 'mark_failed';

export interface PublishingTransitionResult {
  updates: {
    status: PublishingQueueStatus;
    scheduled_for?: string | null;
  };
  auditAction: string;
  successMessage: string;
}

export interface PublishingAdapter {
  id: string;
  label: string;
  transition(action: PublishingAction, payload?: { scheduled_for?: string | null }): PublishingTransitionResult;
}

export function normalizePublishingStatus(status: string | null | undefined): PublishingQueueViewStatus {
  if (status === 'approved' || status === 'ready') return 'ready';
  if (status === 'sent_to_buffer' || status === 'queued') return 'queued';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'exported') return 'exported';
  if (status === 'published') return 'published';
  return 'failed';
}

export function buildInternalPublishingAdapter(currentStatus: string): PublishingAdapter {
  return {
    id: 'pulse_internal',
    label: 'Pulse Internal Queue',
    transition(action, payload) {
      switch (action) {
        case 'add_to_queue':
          return {
            updates: { status: 'queued' },
            auditAction: 'publishing_add_to_queue',
            successMessage: 'Added to Pulse publishing queue',
          };
        case 'set_scheduled_time':
          return {
            updates: { status: 'scheduled', scheduled_for: payload?.scheduled_for ?? null },
            auditAction: 'publishing_schedule_set',
            successMessage: 'Scheduled in Pulse publishing queue',
          };
        case 'mark_exported':
          return {
            updates: {
              status: currentStatus === 'published' ? 'published' : 'exported',
            },
            auditAction: 'publishing_export_pack',
            successMessage: 'Publish pack exported',
          };
        case 'mark_published':
          return {
            updates: { status: 'published' },
            auditAction: 'publishing_mark_published',
            successMessage: 'Marked as published',
          };
        default:
          return {
            updates: { status: 'failed' },
            auditAction: 'publishing_mark_failed',
            successMessage: 'Marked as failed',
          };
      }
    },
  };
}
