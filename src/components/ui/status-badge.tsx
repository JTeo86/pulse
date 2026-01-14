import { cn } from '@/lib/utils';

type Status = 
  | 'new' 
  | 'processing' 
  | 'ready' 
  | 'draft' 
  | 'needs_changes' 
  | 'approved' 
  | 'sent_to_buffer' 
  | 'scheduled' 
  | 'published' 
  | 'failed';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  new: { label: 'New', className: 'status-chip bg-info/10 text-info' },
  processing: { label: 'Processing', className: 'status-chip bg-warning/10 text-warning' },
  ready: { label: 'Ready', className: 'status-chip bg-success/10 text-success' },
  draft: { label: 'Draft', className: 'status-chip bg-muted text-muted-foreground' },
  needs_changes: { label: 'Needs Changes', className: 'status-chip bg-warning/10 text-warning' },
  approved: { label: 'Approved', className: 'status-chip bg-success/10 text-success' },
  sent_to_buffer: { label: 'Sent to Buffer', className: 'status-chip bg-info/10 text-info' },
  scheduled: { label: 'Scheduled', className: 'status-chip bg-accent/20 text-accent-foreground' },
  published: { label: 'Published', className: 'status-chip bg-success/10 text-success' },
  failed: { label: 'Failed', className: 'status-chip bg-destructive/10 text-destructive' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  
  return (
    <span className={cn(config.className, className)}>
      {config.label}
    </span>
  );
}
