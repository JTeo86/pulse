import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function randomNonce() {
  return crypto.randomUUID().replace(/-/g, '');
}

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return atob(padded);
}

async function getUserIdFromAuthHeader(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';

  try {
    const clientId = Deno.env.get('BUFFER_CLIENT_ID');
    const clientSecret = Deno.env.get('BUFFER_CLIENT_SECRET');
    const defaultRedirect = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5173';
    const callbackUrl = Deno.env.get('BUFFER_REDIRECT_URI') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/buffer-oauth?action=callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Buffer OAuth is not configured (missing BUFFER_CLIENT_ID or BUFFER_CLIENT_SECRET).');
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        return new Response('Missing code or state', { status: 400, headers: corsHeaders });
      }

      let parsedState: { nonce: string };
      try {
        parsedState = JSON.parse(base64UrlDecode(state));
      } catch {
        return new Response('Invalid OAuth state', { status: 400, headers: corsHeaders });
      }

      const { data: oauthState } = await supabase
        .from('buffer_oauth_states')
        .select('nonce, venue_id, user_id, redirect_to, expires_at')
        .eq('nonce', parsedState.nonce)
        .maybeSingle();

      if (!oauthState || new Date(oauthState.expires_at).getTime() < Date.now()) {
        return new Response('OAuth state expired. Please retry.', { status: 400, headers: corsHeaders });
      }

      await supabase.from('buffer_oauth_states').delete().eq('nonce', parsedState.nonce);

      const tokenRes = await fetch('https://api.bufferapp.com/1/oauth2/token.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
          code,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData?.access_token) {
        throw new Error(tokenData?.error ?? tokenData?.message ?? 'Failed to exchange Buffer OAuth code.');
      }

      const userRes = await fetch('https://api.bufferapp.com/1/user.json', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();

      const { error: upsertError } = await supabase
        .from('venue_buffer_connections')
        .upsert({
          venue_id: oauthState.venue_id,
          buffer_access_token: tokenData.access_token,
          buffer_user_id: userData?.id ? String(userData.id) : null,
          connected_at: new Date().toISOString(),
        }, { onConflict: 'venue_id' });

      if (upsertError) throw upsertError;

      const redirectUrl = new URL(oauthState.redirect_to || defaultRedirect);
      redirectUrl.searchParams.set('buffer', 'connected');
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const userId = await getUserIdFromAuthHeader(supabase, req.headers.get('Authorization'));
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

    if (action === 'start') {
      if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      const { venue_id, redirect_to } = await req.json();
      if (!venue_id) return jsonResponse({ error: 'venue_id is required' }, 400);

      const { data: isMember } = await supabase.rpc('is_venue_member', { check_venue_id: venue_id, check_user_id: userId });
      if (!isMember) return jsonResponse({ error: 'Forbidden' }, 403);

      const nonce = randomNonce();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const finalRedirect = typeof redirect_to === 'string' && redirect_to ? redirect_to : `${defaultRedirect}/venue/integrations`;

      const { error } = await supabase.from('buffer_oauth_states').insert({
        nonce,
        venue_id,
        user_id: userId,
        redirect_to: finalRedirect,
        expires_at: expiresAt,
      });
      if (error) throw error;

      const state = base64UrlEncode(JSON.stringify({ nonce }));
      const authUrl = new URL('https://buffer.com/oauth2/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', callbackUrl);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);

      return jsonResponse({ auth_url: authUrl.toString() });
    }

    if (action === 'status') {
      const venueId = url.searchParams.get('venue_id');
      if (!venueId) return jsonResponse({ error: 'venue_id is required' }, 400);

      const { data: isMember } = await supabase.rpc('is_venue_member', { check_venue_id: venueId, check_user_id: userId });
      if (!isMember) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data } = await supabase
        .from('venue_buffer_connections')
        .select('buffer_user_id, connected_at')
        .eq('venue_id', venueId)
        .maybeSingle();

      return jsonResponse({ connected: Boolean(data), connection: data ?? null });
    }

    if (action === 'channels') {
      const venueId = url.searchParams.get('venue_id');
      if (!venueId) return jsonResponse({ error: 'venue_id is required' }, 400);

      const { data: isMember } = await supabase.rpc('is_venue_member', { check_venue_id: venueId, check_user_id: userId });
      if (!isMember) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data: conn } = await supabase
        .from('venue_buffer_connections')
        .select('buffer_access_token')
        .eq('venue_id', venueId)
        .maybeSingle();

      if (!conn?.buffer_access_token) return jsonResponse({ connected: false, channels: [] });

      const channelsRes = await fetch('https://api.bufferapp.com/1/profiles.json', {
        headers: { Authorization: `Bearer ${conn.buffer_access_token}` },
      });
      const channelsData = await channelsRes.json();

      if (!channelsRes.ok) {
        return jsonResponse({ connected: false, channels: [], error: channelsData?.error ?? 'Failed to fetch Buffer channels' }, 400);
      }

      const channels = Array.isArray(channelsData)
        ? channelsData.map((profile: any) => ({
            id: String(profile.id),
            service: String(profile.service ?? ''),
            service_username: String(profile.service_username ?? ''),
            formatted_username: String(profile.formatted_username ?? profile.service_username ?? ''),
          }))
        : [];

      return jsonResponse({ connected: true, channels });
    }

    if (action === 'disconnect') {
      if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      const { venue_id } = await req.json();
      if (!venue_id) return jsonResponse({ error: 'venue_id is required' }, 400);

      const { data: isAdmin } = await supabase.rpc('is_venue_admin', { check_venue_id: venue_id, check_user_id: userId });
      if (!isAdmin) return jsonResponse({ error: 'Forbidden' }, 403);

      await supabase.from('venue_buffer_connections').delete().eq('venue_id', venue_id);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    console.error('buffer-oauth error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
