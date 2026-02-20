import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, Shield, User, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface Member {
  id: string;
  user_id: string;
  role: 'admin' | 'staff';
  created_at: string;
  email?: string;
}

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  role: z.enum(['admin', 'staff']),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function TeamPage() {
  const { currentVenue, isAdmin } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null);
  const [processing, setProcessing] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'staff' },
  });

  const selectedRole = watch('role');

  useEffect(() => {
    if (!currentVenue) return;

    const fetchMembers = async () => {
      try {
        const { data, error } = await supabase
          .from('venue_members')
          .select('*')
          .eq('venue_id', currentVenue.id)
          .order('created_at');

        if (error) throw error;
        
        // Note: In a real app, you'd join with a profiles table to get emails
        // For now, we just show user_ids
        setMembers((data || []) as Member[]);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading team',
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [currentVenue, toast]);

  const onInvite = async (data: InviteFormData) => {
    if (!currentVenue) return;
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: {
          venueId: currentVenue.id,
          email: data.email,
          role: data.role,
        },
      });

      if (error) throw error;

      toast({
        title: 'Invite sent',
        description: `An invitation has been sent to ${data.email}.`,
      });
      setInviteOpen(false);
      reset();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send invite',
        description: error.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRoleChange = async (member: Member, newRole: 'admin' | 'staff') => {
    if (!isAdmin || member.user_id === user?.id) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('venue_members')
        .update({ role: newRole })
        .eq('id', member.id);

      if (error) throw error;

      setMembers(prev => prev.map(m => 
        m.id === member.id ? { ...m, role: newRole } : m
      ));
      toast({ title: 'Role updated' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error updating role',
        description: error.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!deleteConfirm || !isAdmin) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('venue_members')
        .delete()
        .eq('id', deleteConfirm.id);

      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== deleteConfirm.id));
      toast({ title: 'Member removed' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error removing member',
        description: error.message,
      });
    } finally {
      setProcessing(false);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <PageHeader
          title="Team"
          description="Manage venue team members and their roles"
          action={
            isAdmin && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button className="btn-primary-editorial">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite team member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join {currentVenue?.name}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit(onInvite)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="colleague@venue.com"
                        className="input-editorial"
                        {...register('email')}
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={selectedRole}
                        onValueChange={(v) => setValue('role', v as 'admin' | 'staff')}
                      >
                        <SelectTrigger className="input-editorial">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              Staff - Can upload photos
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Admin - Full access
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="btn-primary-editorial">
                        Send invite
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )
          }
        />

        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team members"
            description="You're the first member of this venue"
          />
        ) : (
          <div className="card-elevated divide-y divide-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    {member.role === 'admin' ? (
                      <Shield className="w-5 h-5 text-accent" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {member.user_id === user?.id ? 'You' : member.user_id.slice(0, 8) + '...'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                  </div>
                </div>

                {isAdmin && member.user_id !== user?.id && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member, v as 'admin' | 'staff')}
                      disabled={processing}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteConfirm(member)}
                      disabled={processing}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove team member?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove their access to {currentVenue?.name}. They can be invited again later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveMember}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </AppLayout>
  );
}
