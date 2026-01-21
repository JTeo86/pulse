import { motion } from 'framer-motion';
import { LucideIcon, Sparkles } from 'lucide-react';

interface ComingSoonCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  features?: string[];
}

export function ComingSoonCard({ title, description, icon: Icon, features }: ComingSoonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="module-card max-w-2xl mx-auto"
    >
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Icon className="w-7 h-7 text-accent" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="font-serif text-2xl font-medium">{title}</h2>
            <span className="coming-soon-badge">
              <Sparkles className="w-3 h-3" />
              Coming Soon
            </span>
          </div>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {description}
          </p>
          
          {features && features.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground/80">What to expect:</p>
              <ul className="space-y-1.5">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
