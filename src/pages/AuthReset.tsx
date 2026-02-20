import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

type ResetFormData = z.infer<typeof resetSchema>;
type Stage = 'verifying' | 'set-password' | 'error' | 'done';

export default function AuthReset() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      // Try code (PKCE flow)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setErrorMsg(error.message);
          setStage('error');
        } else {
          setStage('set-password');
        }
        return;
      }

      // Try hash tokens (implicit flow — type=recovery)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.slice(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');

        if (accessToken && refreshToken && type === 'recovery') {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          if (error) {
            setErrorMsg(error.message);
            setStage('error');
          } else {
            setStage('set-password');
          }
          return;
        }
      }

      // Check existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setStage('set-password');
        return;
      }

      setErrorMsg('Invalid or expired password reset link.');
      setStage('error');
    }

    handleCallback();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (data: ResetFormData) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      setStage('done');
      toast({ title: 'Password updated!', description: 'You can now sign in with your new password.' });
      setTimeout(() => navigate('/brand/overview', { replace: true }), 1500);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update password',
        description: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left — form */}
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

          {stage === 'verifying' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-muted-foreground text-sm">Verifying reset link…</p>
            </div>
          )}

          {stage === 'set-password' && (
            <>
              <div className="mb-8">
                <h1 className="font-serif text-3xl font-medium text-foreground mb-2">Set new password</h1>
                <p className="text-muted-foreground text-sm">Choose a strong password for your account.</p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                    New password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    className="bg-card border-border focus:border-accent/60 focus:ring-0"
                    {...register('password')}
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Confirm password
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    className="bg-card border-border focus:border-accent/60 focus:ring-0"
                    {...register('confirm')}
                  />
                  {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90 transition-colors border-0 mt-2"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating…
                    </span>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>

              <p className="mt-8 text-xs text-muted-foreground text-center">
                <Link to="/auth" className="text-foreground hover:text-accent transition-colors">
                  Back to sign in
                </Link>
              </p>
            </>
          )}

          {stage === 'done' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-accent" />
              <h2 className="font-serif text-2xl font-medium text-foreground">Password updated!</h2>
              <p className="text-muted-foreground text-sm">Redirecting to your dashboard…</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <h2 className="font-serif text-2xl font-medium text-foreground">Link expired</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {errorMsg || 'This password reset link is expired or has already been used.'}
                </p>
              </div>
              <Link to="/auth">
                <Button variant="outline" className="w-full">Back to sign in</Button>
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* Right — brand panel */}
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
              Pulse helps hospitality venues plan smarter, publish faster, and understand their guests.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
