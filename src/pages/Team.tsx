import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Users, UserPlus, Shield, User, Trash2, RefreshCw,
  Copy, Clock, Mail, CheckCircle2, XCircle, Crown,
} from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';

import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type VenueRole = 'staff' | 'manager' | 'venue_admin';

interface Member {
  id: string;
  user_id: string;
  role: VenueRole;
  created_at: string;
  email?: string;
}

interface VenueInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_sent_at: string | null;
  send_count: number;
  accepted_at: string | null;
}

const ROLE_RANK: Record<VenueRole, number> = { staff: 1, manager: 2, venue_admin: 3 };

function roleRank(role: string): number {
  return ROLE_RANK[role as VenueRole] ?? 0;
}

const ROLE_LABELS: Record<VenueRole, string> = {
  staff: 'Staff',
  manager: 'Manager',
  venue_admin: 'Venue Admin',
};

function RoleBadge({ role }: { role: string }) {
  if (role === 'venue_admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent border border-accent/25">
        <Crown className="w-3 h-3" />
        Venue Admin
      </span>
    );
  }
  if (role === 'manager') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-info/10 text-info border border-info/20">
        <Shield className="w-3 h-3" />
        Manager
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      <User className="w-3 h-3" />
      Staff
    </span>
  );
}

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  role: z.enum(['staff', 'manager', 'venue_admin']),
});
type InviteFormData = z.infer<typeof inviteSchema>;

function canResend(invite: VenueInvite): boolean {
  const lastSent = invite.last_sent_at ?? invite.created_at;
  return Date.now() - new Date(lastSent).getTime() > 60_000;
}

function lastSentLabel(invite: VenueInvite): string {
  const t = invite.last_sent_at ?? invite.created_at;
  return formatDistanceToNow(new Date(t), { addSuffix: true });
}

export default function TeamPage() {
  const { currentVenue, currentMember } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const myRole = (currentMember?.role ?? 'staff') as VenueRole;
  const myRank = roleRank(myRole);
  const isVenueAdmin = myRole === 'venue_admin';
  const isManagerOrAbove = myRank >= 2;

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<VenueInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<VenueInvite | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'staff' },
  });
  const selectedRole = watch('role');

  const fetchData = useCallback(async () => {
    if (!currentVenue) return;
    try {
      const [membersRes, invitesRes] = await Promise.all([
        supabase.from('venue_members').select('*').eq('venue_id', currentVenue.id).order('created_at'),
        supabase
          .from('venue_invites')
          .select('id, email, role, created_at, last_sent_at, send_count, accepted_at')
          .eq('venue_id', currentVenue.id)
          .order('accepted_at', { ascending: true, nullsFirst: true })
          .order('created_at', { ascending: false }),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (invitesRes.error) throw invitesRes.error;
      setMembers((membersRes.data || []) as Member[]);
      setInvites((invitesRes.data || []) as unknown as VenueInvite[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error loading team', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [currentVenue, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pendingInvites = invites.filter((i) => !i.accepted_at);
  const acceptedInvites = invites.filter((i) => i.accepted_at);

  const onInvite = async (data: InviteFormData) => {
    if (!currentVenue) return;
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { venueId: currentVenue.id, email: data.email, role: data.role },
      });
      if (error) throw error;
      toast({ title: 'Invite sent', description: `Invitation sent to ${data.email}.` });
      setInviteOpen(false);
      reset();
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to send invite', description: error.message || 'Something went wrong.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleResend = async (invite: VenueInvite) => {
    if (!currentVenue || !canResend(invite)) return;
    setResendingId(invite.id);
    try {
      const { error } = await supabase.functions.invoke('resend-invite', {
        body: { venueId: currentVenue.id, email: invite.email },
      });
      if (error) throw error;
      toast({ title: 'Invite resent', description: `A new invite email was sent to ${invite.email}.` });
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to resend', description: error.message });
    } finally {
      setResendingId(null);
    }
  };

  const handleCancelInvite = async () => {
    if (!cancelConfirm || !currentVenue) return;
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('venue_invites')
        .delete()
        .eq('id', cancelConfirm.id)
        .is('accepted_at', null);
      if (error) throw error;
      setInvites((prev) => prev.filter((i) => i.id !== cancelConfirm.id));
      toast({ title: 'Invite cancelled', description: `Invite for ${cancelConfirm.email} has been removed.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error cancelling invite', description: error.message });
    } finally {
      setProcessing(false);
      setCancelConfirm(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!deleteConfirm || !currentVenue) return;
    setProcessing(true);
    try {
      const { error } = await supabase.rpc('remove_member', {
        p_venue_id: currentVenue.id,
        p_target_user_id: deleteConfirm.user_id,
      });
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.id !== deleteConfirm.id));
      toast({ title: 'Member removed' });
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('last Venue Admin')) {
        toast({
          variant: 'destructive',
          title: "Can't remove the last Venue Admin",
          description: 'Promote another member first.',
        });
      } else if (msg.includes('permission')) {
        toast({ variant: 'destructive', title: 'Permission denied', description: 'You cannot remove this member.' });
      } else {
        toast({ variant: 'destructive', title: 'Error removing member', description: msg });
      }
    } finally {
      setProcessing(false);
      setDeleteConfirm(null);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast({ title: 'Copied', description: email });
  };

  /** Can the current user remove this member? */
  function canRemove(member: Member): boolean {
    if (member.user_id === user?.id) return false; // can't remove self
    return myRank > roleRank(member.role);
  }

  /** Can the current user cancel this invite? */
  function canCancelInvite(invite: VenueInvite): boolean {
    if (isVenueAdmin) return true;
    if (isManagerOrAbove && invite.role === 'staff') return true;
    return false;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <PageHeader
        title="Team"
        description={
          pendingInvites.length > 0
            ? `${members.length} member${members.length !== 1 ? 's' : ''} · ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? 's' : ''}`
            : `Manage venue team members and their roles`
        }
        action={
          isManagerOrAbove && (
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
                  <DialogDescription>Send an invitation to join {currentVenue?.name}</DialogDescription>
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
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={selectedRole} onValueChange={(v) => setValue('role', v as VenueRole)}>
                      <SelectTrigger className="input-editorial"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">
                          <div className="flex items-center gap-2"><User className="w-4 h-4" />Staff — Can upload photos &amp; view content</div>
                        </SelectItem>
                        <SelectItem value="manager">
                          <div className="flex items-center gap-2"><Shield className="w-4 h-4" />Manager — Can manage staff</div>
                        </SelectItem>
                        {isVenueAdmin && (
                          <SelectItem value="venue_admin">
                            <div className="flex items-center gap-2"><Crown className="w-4 h-4" />Venue Admin — Full access</div>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                    <Button type="submit" className="btn-primary-editorial" disabled={processing}>
                      {processing ? 'Sending…' : 'Send invite'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {/* ── Members ── */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No team members" description="You're the first member of this venue" />
        ) : (
          <div className="card-elevated divide-y divide-border">
            {members.map((member) => {
              const isMe = member.user_id === user?.id;
              const removable = canRemove(member);
              return (
                <div key={member.id} className="flex items-center justify-between p-4 gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                      {member.role === 'venue_admin' ? (
                        <Crown className="w-5 h-5 text-accent" />
                      ) : member.role === 'manager' ? (
                        <Shield className="w-5 h-5 text-info" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {isMe ? 'You' : `User ${member.user_id.slice(0, 8)}…`}
                        {isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <div className="mt-1">
                        <RoleBadge role={member.role} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Role change — only venue_admin can change roles for others below them */}
                    {isVenueAdmin && !isMe && (
                      <Select
                        value={member.role}
                        onValueChange={async (v) => {
                          setProcessing(true);
                          try {
                            const { error } = await supabase
                              .from('venue_members')
                              .update({ role: v })
                              .eq('id', member.id);
                            if (error) throw error;
                            setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, role: v as VenueRole } : m));
                            toast({ title: 'Role updated' });
                          } catch (err: any) {
                            toast({ variant: 'destructive', title: 'Error updating role', description: err.message });
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        disabled={processing}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="venue_admin">Venue Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {removable && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirm(member)}
                        disabled={processing}
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Invitations ── */}
      {(isManagerOrAbove || invites.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Invitations
            </h2>
            {pendingInvites.length > 0 && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {pendingInvites.length} pending
              </Badge>
            )}
          </div>

          {invites.length === 0 ? (
            <div className="card-elevated p-6 text-center">
              <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No invitations sent yet.</p>
            </div>
          ) : (
            <div className="card-elevated divide-y divide-border">
              {/* Pending first */}
              {pendingInvites.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      Pending — these users haven't created an account yet.
                    </p>
                  </div>
                  {pendingInvites.map((invite) => {
                    const resendable = canResend(invite);
                    const sending = resendingId === invite.id;
                    const cancelable = canCancelInvite(invite);
                    return (
                      <div key={invite.id} className="flex items-center justify-between p-4 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{invite.email}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <RoleBadge role={invite.role} />
                              <span className="text-xs text-muted-foreground">
                                Sent {lastSentLabel(invite)}
                                {(invite.send_count ?? 0) > 1 && ` · ${invite.send_count}×`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => copyEmail(invite.email)}
                            title="Copy email"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          {isManagerOrAbove && (
                            <Button
                              size="sm" variant="outline"
                              className="text-xs h-8 px-3"
                              onClick={() => handleResend(invite)}
                              disabled={!resendable || sending || processing}
                              title={resendable ? 'Resend invite email' : 'Wait 60s before resending'}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${sending ? 'animate-spin' : ''}`} />
                              {sending ? 'Sending…' : 'Resend'}
                            </Button>
                          )}
                          {cancelable && (
                            <Button
                              size="icon" variant="ghost"
                              onClick={() => setCancelConfirm(invite)}
                              disabled={processing}
                              title="Cancel invite"
                            >
                              <XCircle className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Accepted */}
              {acceptedInvites.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Accepted</p>
                  </div>
                  {acceptedInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between p-4 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{invite.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <RoleBadge role={invite.role} />
                            <span className="text-xs text-muted-foreground">
                              Accepted {formatDistanceToNow(new Date(invite.accepted_at!), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge className="text-[10px] bg-accent/20 text-accent border-accent/30 shrink-0">
                        Member added
                      </Badge>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Dialogs ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove their access to {currentVenue?.name}. They can be re-invited later.
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

      <AlertDialog open={!!cancelConfirm} onOpenChange={(open) => !open && setCancelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invite?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the pending invite for{' '}
              <span className="font-medium text-foreground">{cancelConfirm?.email}</span>. They won't be able
              to use the old invite link. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep invite</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
