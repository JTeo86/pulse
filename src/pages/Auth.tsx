import { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const isInviteFlow = searchParams.get('invite') === '1';

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

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setForgotSending(false);
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                  {isInviteFlow ? 'Set your password' : 'Password'}
                </Label>
                {!isInviteFlow && (
                  <button
                    type="button"
                    onClick={() => { setForgotSent(false); setForgotOpen(true); }}
                    className="text-xs text-muted-foreground hover:text-accent transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
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

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={(o) => { setForgotOpen(o); if (!o) setForgotSent(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your email and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <AnimatePresence mode="wait">
            {forgotSent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-4 text-center space-y-2"
              >
                <p className="text-sm font-medium text-foreground">Check your inbox</p>
                <p className="text-xs text-muted-foreground">
                  We sent a password reset link to <span className="font-medium text-foreground">{forgotEmail}</span>.
                </p>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@venue.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                    className="bg-card border-border"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleForgotPassword}
                    disabled={forgotSending || !forgotEmail.trim()}
                    className="bg-accent text-accent-foreground hover:bg-accent/90 border-0"
                  >
                    {forgotSending ? 'Sending…' : 'Send reset link'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

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
