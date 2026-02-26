import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Caller client — uses caller's JWT to verify auth + membership
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify caller is authenticated
  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const callerId = callerUser.id;

  let body: { venueId: string; email: string; role: 'manager' | 'staff' };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { venueId, email, role } = body;
  if (!venueId || !email || !role) {
    return new Response(JSON.stringify({ error: 'venueId, email, and role are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!['manager', 'staff'].includes(role)) {
    return new Response(JSON.stringify({ error: 'role must be manager or staff' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check caller is owner or manager of this venue
  const { data: venue } = await callerClient
    .from('venues')
    .select('owner_user_id')
    .eq('id', venueId)
    .maybeSingle();

  const isOwner = venue?.owner_user_id === callerId;

  const { data: membership, error: memberError } = await callerClient
    .from('venue_members')
    .select('id, role')
    .eq('venue_id', venueId)
    .eq('user_id', callerId)
    .maybeSingle();

  const isManager = membership?.role === 'manager';

  if (!isOwner && !isManager) {
    return new Response(JSON.stringify({ error: 'Forbidden: you must be the venue owner or a manager' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Admin client — uses service role to send invite email
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalizedEmail = email.toLowerCase().trim();

  const appUrl = getAppUrl(req);
  console.log('Resolved appUrl:', appUrl);

  // Fetch venue name to surface on the invite acceptance page
  const adminClientForVenue = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: venueData } = await adminClientForVenue
    .from('venues')
    .select('name')
    .eq('id', venueId)
    .maybeSingle();

  const venueName = venueData?.name ? encodeURIComponent(venueData.name) : '';
  const redirectTo = `${appUrl}/auth/invite?venueId=${venueId}${venueName ? `&venueName=${venueName}` : ''}`;

  let resultUserId: string | undefined;
  let isExistingUser = false;

  // Attempt to invite — if user already exists, fall back to direct membership add
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo }
  );

  if (inviteError) {
    const isDuplicate =
      inviteError.message?.toLowerCase().includes('database error saving new user') ||
      inviteError.message?.toLowerCase().includes('user already registered') ||
      inviteError.status === 422;

    if (!isDuplicate) {
      console.error('Invite error:', inviteError);
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // User already exists in auth — find them by scanning listUsers with pagination
    console.log('User already exists, looking up by email:', normalizedEmail);
    let foundUser = null;
    let page = 1;
    const perPage = 1000;

    while (!foundUser) {
      const { data: pageData, error: pageError } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });
      if (pageError || !pageData?.users?.length) break;
      foundUser = pageData.users.find((u) => u.email?.toLowerCase() === normalizedEmail) ?? null;
      if (pageData.users.length < perPage) break; // last page
      page++;
    }

    if (!foundUser) {
      console.error('Could not find existing user after duplicate error:', normalizedEmail);
      return new Response(JSON.stringify({ error: 'Failed to locate existing user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add directly to venue_members
    const { error: memberInsertError } = await adminClient
      .from('venue_members')
      .upsert(
        { venue_id: venueId, user_id: foundUser.id, role },
        { onConflict: 'venue_id,user_id' }
      );

    if (memberInsertError) {
      console.error('Member insert error:', memberInsertError);
      return new Response(JSON.stringify({ error: 'Failed to add existing user to venue' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    resultUserId = foundUser.id;
    isExistingUser = true;
    console.log('Existing user added directly to venue:', normalizedEmail);
  } else {
    resultUserId = inviteData?.user?.id;
    console.log('Invite email sent to new user:', normalizedEmail);
  }

  // Upsert into venue_invites to track the invite/addition (with send tracking)
  const { error: upsertError } = await adminClient
    .from('venue_invites')
    .upsert(
      {
        venue_id: venueId,
        email: normalizedEmail,
        role,
        invited_by: callerId,
        accepted_at: isExistingUser ? new Date().toISOString() : null,
        accepted_by: isExistingUser ? resultUserId : null,
        last_sent_at: isExistingUser ? null : new Date().toISOString(),
        send_count: isExistingUser ? 0 : 1,
      },
      { onConflict: 'venue_id,email' }
    );

  if (upsertError) {
    console.error('Upsert invite error:', upsertError);
    // Non-fatal — continue
  }

  const message = isExistingUser
    ? 'User already exists and has been added to the venue'
    : 'Invite email sent successfully';

  return new Response(JSON.stringify({ ok: true, userId: resultUserId, message }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
