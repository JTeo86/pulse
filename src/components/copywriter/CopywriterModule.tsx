import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyWizard } from './CopyWizard';
import { type CopyModule, moduleConfigs } from './copywriter-config';
import { type CopyProject } from './RecentDrafts';

const modules = Object.values(moduleConfigs);

interface CopywriterModuleProps {
  onProjectSaved?: () => void;
  existingProject?: CopyProject | null;
  onCloseProject?: () => void;
}

export function CopywriterModule({ onProjectSaved, existingProject, onCloseProject }: CopywriterModuleProps) {
  const [selectedModule, setSelectedModule] = useState<CopyModule | null>(null);
  const [loadedProject, setLoadedProject] = useState<CopyProject | null>(null);

  // Auto-open wizard when an existing project is selected
  useEffect(() => {
    if (existingProject) {
      setSelectedModule(existingProject.module as CopyModule);
      setLoadedProject(existingProject);
    }
  }, [existingProject]);

  const handleClose = () => {
    setSelectedModule(null);
    setLoadedProject(null);
    onCloseProject?.();
  };

  const handleProjectSaved = () => {
    onProjectSaved?.();
    handleClose();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((moduleConfig) => (
          <motion.div
            key={moduleConfig.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card
              className="card-elevated cursor-pointer hover:border-accent/30 transition-all group"
              onClick={() => setSelectedModule(moduleConfig.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted/50 group-hover:bg-accent/10 transition-colors">
                      <moduleConfig.icon className={`h-5 w-5 ${moduleConfig.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{moduleConfig.title}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">{moduleConfig.description}</CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
              </CardHeader>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Module Wizard Modal */}
      <AnimatePresence>
        {selectedModule && (
          <CopyWizard
            module={selectedModule}
            onClose={handleClose}
            onProjectSaved={handleProjectSaved}
            existingProject={loadedProject}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export type { CopyModule };
