import { useState } from 'react';
import { motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { CampaignEngine } from '@/components/copywriter/CampaignEngine';
import { RecentDrafts, type CopyProject } from '@/components/copywriter/RecentDrafts';

export default function CopywriterPage() {
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

  return (
    <>
      <PageHeader
        title="Campaign Engine"
        description="AI-powered marketing execution aligned with your brand and business goals."
        action={
          !wizardOpen ? (
            <button
              onClick={handleNewCampaign}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <span>+ New Campaign</span>
            </button>
          ) : undefined
        }
      />

      {wizardOpen ? (
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
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <RecentDrafts
            refreshTrigger={refreshTrigger}
            onSelectProject={handleSelectProject}
          />

          {/* Empty state */}
          <div className="rounded-xl border border-border/50 bg-card/40 p-16 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-medium text-foreground">Start a campaign</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Define your objective, select an opportunity, and generate a full campaign kit in minutes.
                </p>
              </div>
              <button
                onClick={handleNewCampaign}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                New Campaign
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}
