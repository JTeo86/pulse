import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, FileText, Megaphone, MessageSquare, ChevronRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyWizard } from './CopyWizard';

export type CopyModule = 'email' | 'blog' | 'ad_copy' | 'sms_push';

interface ModuleConfig {
  id: CopyModule;
  title: string;
  description: string;
  icon: typeof Mail;
  color: string;
}

const modules: ModuleConfig[] = [
  {
    id: 'email',
    title: 'Email Campaigns',
    description: 'Design beautiful emails that match your brand identity',
    icon: Mail,
    color: 'text-blue-400',
  },
  {
    id: 'blog',
    title: 'Blog Posts',
    description: 'Generate SEO-optimized blog content in your brand voice',
    icon: FileText,
    color: 'text-green-400',
  },
  {
    id: 'ad_copy',
    title: 'Ad Copy',
    description: 'Create compelling ad copy for any platform',
    icon: Megaphone,
    color: 'text-orange-400',
  },
  {
    id: 'sms_push',
    title: 'SMS / Push',
    description: 'Craft concise, impactful messages for mobile audiences',
    icon: MessageSquare,
    color: 'text-purple-400',
  },
];

interface CopywriterModuleProps {
  onProjectSaved?: () => void;
}

export function CopywriterModule({ onProjectSaved }: CopywriterModuleProps) {
  const [selectedModule, setSelectedModule] = useState<CopyModule | null>(null);

  const handleClose = () => {
    setSelectedModule(null);
  };

  const handleProjectSaved = () => {
    onProjectSaved?.();
    handleClose();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((module) => (
          <motion.div
            key={module.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card 
              className="card-elevated cursor-pointer hover:border-accent/30 transition-all group"
              onClick={() => setSelectedModule(module.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted/50 group-hover:bg-accent/10 transition-colors">
                      <module.icon className={`h-5 w-5 ${module.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{module.title}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">{module.description}</CardDescription>
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
            moduleConfig={modules.find(m => m.id === selectedModule)!}
            onClose={handleClose}
            onProjectSaved={handleProjectSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
