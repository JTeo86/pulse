import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="ui-fade-in flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-10">
      <div className="space-y-2">
        <h1 className="heading-section text-foreground text-3xl md:text-4xl">{title}</h1>
        {description && (
          <p className="text-sm md:text-base text-muted-foreground/85 max-w-2xl">{description}</p>
        )}
      </div>
      {action && <div className="sm:pt-1 sm:shrink-0">{action}</div>}
    </div>
  );
}
