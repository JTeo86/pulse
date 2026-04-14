import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const TIERS = [
  {
    name: 'Starter',
    description: 'For teams getting started with consistent content.',
    images: '~60 images',
    storage: '2 GB',
    users: '2 users',
    features: [],
    highlighted: false,
  },
  {
    name: 'Growth',
    description: 'For teams that publish often and collaborate daily.',
    images: '~200 images',
    storage: '10 GB',
    users: '5 users',
    features: ['Marketplace access'],
    highlighted: true,
  },
  {
    name: 'Pro',
    description: 'For high-volume teams scaling content and operations.',
    images: '~500 images',
    storage: '25 GB',
    users: '10 users',
    features: [],
    highlighted: false,
  },
] as const;

export default function PricingPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground">Simple plans that grow with your team.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <Card key={tier.name} className={tier.highlighted ? 'border-accent shadow-sm' : ''}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <CardTitle>{tier.name}</CardTitle>
                {tier.highlighted && <Badge className="bg-accent text-accent-foreground">Most popular</Badge>}
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{tier.images}</p>
              <p>{tier.storage}</p>
              <p>{tier.users}</p>
              {tier.features.map((feature) => (
                <p key={feature} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-accent" />
                  {feature}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button asChild>
          <Link to="/settings/billing">Continue to billing</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/home">Back to workspace</Link>
        </Button>
      </div>
    </motion.div>
  );
}
