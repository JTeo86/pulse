import { useState } from 'react';
import { motion } from 'framer-motion';
import { CampaignEngine } from '@/components/copywriter/CampaignEngine';
import { RecentDrafts, type CopyProject } from '@/components/copywriter/RecentDrafts';
import { Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CampaignsTab() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedProject, setSelectedProject] = useState<CopyProject | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleProjectSaved = () => {
    setRefreshTrigger(prev => prev + 1);
    setSelectedProject(null);
    setWizardOpen(false);
  };

  const handleSelectProject = (project: CopyProject) => {
    setSelectedProject(project);
    setWizardOpen(true);
  };

  const handleCloseWizard = () => {
    setSelectedProject(null);
    setWizardOpen(false);
  };

  const handleNewCampaign = () => {
    setSelectedProject(null);
    setWizardOpen(true);
  };

  if (wizardOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <CampaignEngine
          onProjectSaved={handleProjectSaved}
          onClose={handleCloseWizard}
          existingProject={selectedProject}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Campaign list from recent drafts */}
      <RecentDrafts
        refreshTrigger={refreshTrigger}
        onSelectProject={handleSelectProject}
      />

      {/* Empty / CTA state */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-12 text-center">
        <div className="max-w-sm mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-base font-medium text-foreground">Create a campaign</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Define your objective, select an opportunity, and generate a full campaign kit — strategy, copy, and visual direction.
            </p>
          </div>
          <Button onClick={handleNewCampaign} className="gap-2">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
