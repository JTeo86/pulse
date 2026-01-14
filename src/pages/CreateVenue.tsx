import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useVenue } from '@/lib/venue-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const venueSchema = z.object({
  name: z.string().min(2, 'Venue name must be at least 2 characters'),
});

type VenueFormData = z.infer<typeof venueSchema>;

export default function CreateVenuePage() {
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { refreshVenues } = useVenue();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<VenueFormData>({
    resolver: zodResolver(venueSchema),
  });

  const onSubmit = async (data: VenueFormData) => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Create venue
      const { data: venue, error: venueError } = await supabase
        .from('venues')
        .insert({ name: data.name })
        .select()
        .single();

      if (venueError) throw venueError;

      // Add creator as admin
      const { error: memberError } = await supabase
        .from('venue_members')
        .insert({
          venue_id: venue.id,
          user_id: user.id,
          role: 'admin',
        });

      if (memberError) throw memberError;

      // Create default brand kit
      const { error: brandKitError } = await supabase
        .from('brand_kits')
        .insert({
          venue_id: venue.id,
          preset: 'casual',
        });

      if (brandKitError) throw brandKitError;

      await refreshVenues();

      toast({
        title: 'Venue created',
        description: `${data.name} is ready to go!`,
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error creating venue',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-accent" />
          </div>
          <h1 className="font-serif text-3xl font-medium mb-2">Create your venue</h1>
          <p className="text-muted-foreground">
            Set up your restaurant, bar, café, or hotel to start creating content.
          </p>
        </div>

        <div className="card-elevated p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Venue name</Label>
              <Input
                id="name"
                placeholder="e.g., The Golden Fork"
                className="input-editorial text-lg"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full btn-primary-editorial"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Create venue
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          You'll be the admin of this venue and can invite team members later.
        </p>
      </motion.div>
    </div>
  );
}
