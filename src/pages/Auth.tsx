import { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const isInviteFlow = searchParams.get('invite') === '1';

  // If Supabase redirected back with a session (invited user clicking email link),
  // the auth-context listener picks up the session automatically.
  // Once user is set, redirect them to the app.
  useEffect(() => {
    if (user && !loading) {
      navigate('/brand/overview', { replace: true });
    }
  }, [user, loading, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/brand/overview" replace />;
  }

  const onSubmit = async (data: AuthFormData) => {
    setIsLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Sign in failed',
          description: error.message,
        });
      } else {
        navigate('/brand/overview');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left – Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <Link to="/" className="block mb-12">
            <span className="font-serif text-2xl font-medium text-foreground">
              Pulse<span className="text-accent">.</span>
            </span>
          </Link>

          <div className="mb-8">
            {isInviteFlow ? (
              <>
                <h1 className="font-serif text-3xl font-medium text-foreground mb-2">You're invited!</h1>
                <p className="text-muted-foreground text-sm">Set your password to activate your account and join your team.</p>
              </>
            ) : (
              <>
                <h1 className="font-serif text-3xl font-medium text-foreground mb-2">Sign in</h1>
                <p className="text-muted-foreground text-sm">Access your Pulse dashboard.</p>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@venue.com"
                className="bg-card border-border focus:border-accent/60 focus:ring-0"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                {isInviteFlow ? 'Set your password' : 'Password'}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="bg-card border-border focus:border-accent/60 focus:ring-0"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 transition-colors border-0 mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-accent-foreground/40 border-t-accent-foreground rounded-full animate-spin" />
                  {isInviteFlow ? 'Activating...' : 'Signing in...'}
                </span>
              ) : (
                isInviteFlow ? 'Activate account' : 'Sign In'
              )}
            </Button>
          </form>

          <p className="mt-8 text-xs text-muted-foreground text-center">
            Don't have access?{' '}
            <Link to="/#waitlist" className="text-foreground hover:text-accent transition-colors">
              Join the waitlist
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right – Brand panel */}
      <div className="hidden lg:flex lg:flex-1 bg-card border-l border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-center px-14 xl:px-20">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-foreground font-serif text-4xl xl:text-5xl font-medium leading-tight mb-6">
              Intelligence,<br />not guesswork.
            </h2>
            <p className="text-muted-foreground text-base max-w-sm leading-relaxed">
              Pulse helps hospitality venues plan smarter, publish faster, and understand their guests — without the overhead.
            </p>
            <div className="mt-10 space-y-3 text-sm text-muted-foreground">
              <p className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full bg-accent" />
                AI Marketing Assistant
              </p>
              <p className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full bg-accent" />
                Brand-consistent content generation
              </p>
              <p className="flex items-center gap-3">
                <span className="w-1 h-1 rounded-full bg-accent" />
                Review monitoring & insight
              </p>
            </div>
            <div className="mt-12 pt-8 border-t border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Private Beta</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
