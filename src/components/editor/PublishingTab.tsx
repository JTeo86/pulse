import { Send } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export default function PublishingTab() {
  return (
    <div className="card-elevated p-6">
      <EmptyState
        icon={Send}
        title="Publishing paused for stability"
        description="Buffer publishing is still being finalized. Send actions are temporarily disabled."
      />
    </div>
  );
}
