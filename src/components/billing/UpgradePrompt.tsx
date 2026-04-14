import { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface UpgradePromptProps {
  title: string;
  description: string;
  benefit: string;
  ctaLabel?: string;
  ctaTo?: string;
  secondaryAction?: ReactNode;
  className?: string;
}

export function UpgradePrompt({
  title,
  description,
  benefit,
  ctaLabel = 'View plans',
  ctaTo = '/pricing',
  secondaryAction,
  className,
}: UpgradePromptProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{benefit}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link to={ctaTo} className="inline-flex items-center gap-1.5">
              {ctaLabel}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
          {secondaryAction}
        </div>
      </CardContent>
    </Card>
  );
}
