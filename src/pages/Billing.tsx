import { motion } from 'framer-motion';
import { CreditCard, Check } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';

import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

const plans = [
  {
    name: 'Starter',
    price: '$49',
    features: [
      '50 uploads/month',
      '1 venue',
      '2 team members',
      'Standard support',
    ],
    current: true,
  },
  {
    name: 'Growth',
    price: '$149',
    features: [
      '200 uploads/month',
      '3 venues',
      '10 team members',
      'Priority support',
      'Custom brand rules',
    ],
    current: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    features: [
      'Unlimited uploads',
      'Unlimited venues',
      'Unlimited team',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
    current: false,
  },
];

export default function BillingPage() {
  const { currentVenue } = useVenue();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
        <PageHeader
          title="Billing"
          description="Manage your subscription and billing"
        />

        {/* Current Plan */}
        <div className="card-elevated p-6 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h3 className="font-medium">Current Plan</h3>
              <p className="text-sm text-muted-foreground capitalize">
                {currentVenue?.plan || 'Free'} plan
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Billing management is coming soon. Contact support for plan changes.
          </p>
        </div>

        {/* Plans Grid */}
        <h3 className="font-medium mb-4">Available plans</h3>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div 
              key={plan.name}
              className={`card-elevated p-6 ${plan.current ? 'ring-2 ring-accent' : ''}`}
            >
              {plan.current && (
                <div className="text-xs font-medium text-accent mb-2">Current plan</div>
              )}
              <h4 className="text-lg font-medium">{plan.name}</h4>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-serif">{plan.price}</span>
                {plan.price !== 'Custom' && (
                  <span className="text-muted-foreground">/month</span>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button 
                variant={plan.current ? 'secondary' : 'outline'} 
                className="w-full"
                disabled={plan.current}
              >
                {plan.current ? 'Current' : 'Upgrade'}
              </Button>
            </div>
          ))}
        </div>
      </motion.div>
  );
}
