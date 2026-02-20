import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Users, UserPlus, Shield, User, Trash2, RefreshCw,
  Copy, Clock, Mail, Crown, ArrowRightLeft, Loader2,
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

type MemberRole = 'staff' | 'manager';

interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Member {
  id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  profile?: UserProfile;
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

const ROLE_LABELS: Record<MemberRole, string> = { staff: 'Staff', manager: 'Manager' };

function displayName(member: Member, currentUserId?: string): string {
  if (member.profile?.full_name) return member.profile.full_name;
  if (member.profile?.email) return member.profile.email;
  return `User ${member.user_id.slice(0, 8)}…`;
}

function RoleBadge({ role, isOwner = false }: { role: string; isOwner?: boolean }) {
  if (isOwner) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent border border-accent/25">
        <Crown className="w-3 h-3" />
        Owner
      </span>
    );
  }
  if (role === 'manager') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
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
  role: z.enum(['staff', 'manager']),
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
  const { currentVenue, currentMember, isOwner } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const myRole = (currentMember?.role ?? 'staff') as MemberRole;
  const isManager = myRole === 'manager';
  const canInvite = isOwner || isManager;

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<VenueInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<VenueInvite | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
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
      const [membersRes, invitesRes, profilesRes] = await Promise.all([
        supabase.from('venue_members').select('*').eq('venue_id', currentVenue.id).order('created_at'),
        supabase
          .from('venue_invites')
          .select('id, email, role, created_at, last_sent_at, send_count, accepted_at')
          .eq('venue_id', currentVenue.id)
          .is('accepted_at', null)   // Only pending
          .order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('user_id, email, full_name, avatar_url'),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (invitesRes.error) throw invitesRes.error;

      const profileMap = new Map<string, UserProfile>();
      (profilesRes.data || []).forEach((p: UserProfile) => profileMap.set(p.user_id, p));

      const membersWithProfiles: Member[] = (membersRes.data || []).map((m: any) => ({
        ...m,
        profile: profileMap.get(m.user_id),
      }));

      setMembers(membersWithProfiles);
      setInvites((invitesRes.data || []) as unknown as VenueInvite[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error loading team', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [currentVenue, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onInvite = async (data: InviteFormData) => {
    if (!currentVenue) return;
    // Managers can only invite staff
    if (isManager && !isOwner && data.role !== 'staff') {
      toast({ variant: 'destructive', title: 'Permission denied', description: 'Managers can only invite staff members.' });
      return;
    }
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
      if (msg.includes('owner')) {
        toast({ variant: 'destructive', title: "Can't remove the venue owner", description: 'Transfer ownership first.' });
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

  const handleTransferOwnership = async () => {
    if (!currentVenue || !transferTarget) return;
    setProcessing(true);
    try {
      const { error } = await supabase.rpc('transfer_venue_ownership', {
        p_venue_id: currentVenue.id,
        p_new_owner_id: transferTarget,
      });
      if (error) throw error;
      toast({ title: 'Ownership transferred', description: 'The new owner now has full control.' });
      setTransferOpen(false);
      setTransferTarget('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Transfer failed', description: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast({ title: 'Copied', description: email });
  };

  /** Can the current user remove this member? */
  function canRemove(member: Member): boolean {
    if (member.user_id === user?.id) return false;
    const isTargetOwner = currentVenue?.owner_user_id === member.user_id;
    if (isTargetOwner) return false;
    if (isOwner) return true;
    if (isManager && member.role === 'staff') return true;
    return false;
  }

  /** Can the current user cancel this invite? */
  function canCancelInvite(invite: VenueInvite): boolean {
    if (isOwner) return true;
    if (isManager && invite.role === 'staff') return true;
    return false;
  }

  /** Can the current user change a member's role? */
  function canChangeRole(member: Member): boolean {
    if (member.user_id === user?.id) return false;
    if (currentVenue?.owner_user_id === member.user_id) return false;
    return isOwner;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const pendingInvites = invites.filter((i) => !i.accepted_at);
  const transferableMembers = members.filter(
    (m) => m.user_id !== user?.id && currentVenue?.owner_user_id !== m.user_id
  );

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
          canInvite && (
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
                    <Select value={selectedRole} onValueChange={(v) => setValue('role', v as MemberRole)}>
                      <SelectTrigger className="input-editorial"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">
                          <div className="flex items-center gap-2"><User className="w-4 h-4" />Staff — Can upload photos &amp; view content</div>
                        </SelectItem>
                        {isOwner && (
                          <SelectItem value="manager">
                            <div className="flex items-center gap-2"><Shield className="w-4 h-4" />Manager — Can manage staff &amp; send invites</div>
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
              const isMemberOwner = currentVenue?.owner_user_id === member.user_id;
              const removable = canRemove(member);
              const roleChangeable = canChangeRole(member);
              const label = displayName(member, user?.id);

              return (
                <div key={member.id} className="flex items-center justify-between p-4 gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                      {isMemberOwner ? (
                        <Crown className="w-5 h-5 text-accent" />
                      ) : member.role === 'manager' ? (
                        <Shield className="w-5 h-5 text-primary" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {isMe ? `${label} (you)` : label}
                      </p>
                      {member.profile?.email && member.profile.full_name && (
                        <p className="text-xs text-muted-foreground truncate">{member.profile.email}</p>
                      )}
                      <div className="mt-1">
                        <RoleBadge role={member.role} isOwner={isMemberOwner} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Role change — only owner can change roles */}
                    {roleChangeable && (
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
                            setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, role: v as MemberRole } : m));
                            toast({ title: 'Role updated' });
                          } catch (err: any) {
                            toast({ variant: 'destructive', title: 'Error updating role', description: err.message });
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        disabled={processing}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
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

      {/* ── Transfer Ownership (owner only) ── */}
      {isOwner && transferableMembers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Ownership</h2>
          <div className="card-elevated p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Transfer ownership</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pass full ownership to another member. You'll remain as a manager.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Transfer
            </Button>
          </div>
        </section>
      )}

      {/* ── Pending Invitations ── */}
      {canInvite && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Pending Invitations
            </h2>
            {pendingInvites.length > 0 && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {pendingInvites.length}
              </Badge>
            )}
          </div>

          {pendingInvites.length === 0 ? (
            <div className="card-elevated p-6 text-center">
              <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            </div>
          ) : (
            <div className="card-elevated divide-y divide-border">
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
                      {cancelable && (
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => setCancelConfirm(invite)}
                          disabled={processing}
                          title="Cancel invite"
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
      )}

      {/* ── Remove Member Dialog ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">
                {deleteConfirm ? displayName(deleteConfirm) : ''}
              </span>'s access to {currentVenue?.name}. They can be re-invited later.
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

      {/* ── Cancel Invite Dialog ── */}
      <AlertDialog open={!!cancelConfirm} onOpenChange={(open) => !open && setCancelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invite?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the pending invite for{' '}
              <span className="font-medium text-foreground">{cancelConfirm?.email}</span>. They won't be able
              to use the old invite link.
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

      {/* ── Transfer Ownership Dialog ── */}
      <Dialog open={transferOpen} onOpenChange={(o) => { setTransferOpen(o); if (!o) setTransferTarget(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              Choose a member to become the new owner. You'll remain as a manager.
              This action cannot be undone without their cooperation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New owner</Label>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger><SelectValue placeholder="Select a member…" /></SelectTrigger>
                <SelectContent>
                  {transferableMembers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {displayName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {transferTarget && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                Warning: You will lose owner privileges immediately after this transfer.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              onClick={handleTransferOwnership}
              disabled={!transferTarget || processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-0"
            >
              {processing ? 'Transferring…' : 'Transfer ownership'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
