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

function errorResponse(message: string, status = 400, code = 'bad_request', details?: unknown) {
  return jsonResponse({ error: { code, message, details } }, status);
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

type AdminClient = ReturnType<typeof createClient<any>>;

async function getUserIdFromAuthHeader(supabase: AdminClient, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

function getCallbackUrl() {
  const explicit = Deno.env.get('BUFFER_REDIRECT_URI');
  if (explicit) return explicit;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) throw new Error('SUPABASE_URL is required to construct Buffer OAuth callback URL.');
  return `${supabaseUrl}/functions/v1/buffer-oauth?action=callback`;
}

function resolveSafeRedirect(redirectTo: unknown, appBaseUrl: string) {
  const defaultUrl = new URL('/venue/integrations', appBaseUrl).toString();
  if (typeof redirectTo !== 'string' || !redirectTo.trim()) return defaultUrl;

  try {
    const requested = new URL(redirectTo, appBaseUrl);
    const allowedOrigin = new URL(appBaseUrl).origin;
    if (requested.origin !== allowedOrigin) return defaultUrl;
    return requested.toString();
  } catch {
    return defaultUrl;
  }
}

async function canManageConnection(supabase: AdminClient, venueId: string, userId: string) {
  const [{ data: isVenueAdmin }, { data: venueRow }] = await Promise.all([
    supabase.rpc('is_venue_admin', { check_venue_id: venueId, check_user_id: userId }),
    supabase.from('venues').select('owner_user_id').eq('id', venueId).maybeSingle(),
  ]);

  return Boolean(isVenueAdmin || (venueRow?.owner_user_id && String(venueRow.owner_user_id) === userId));
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
    const callbackUrl = getCallbackUrl();

    if (action === 'callback') {
      if (!clientId || !clientSecret) {
        return errorResponse('Buffer connection is not configured yet.', 200, 'buffer_not_configured');
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        return errorResponse('Missing OAuth callback parameters (code/state).', 400, 'missing_oauth_params');
      }

      let parsedState: { nonce: string };
      try {
        parsedState = JSON.parse(base64UrlDecode(state));
      } catch {
        return errorResponse('Invalid OAuth state payload.', 400, 'invalid_state');
      }

      const { data: oauthState, error: oauthStateError } = await supabase
        .from('buffer_oauth_states')
        .select('nonce, venue_id, user_id, redirect_to, expires_at')
        .eq('nonce', parsedState.nonce)
        .maybeSingle();

      if (oauthStateError) {
        return errorResponse('Failed to validate OAuth state.', 500, 'oauth_state_lookup_failed', oauthStateError.message);
      }

      if (!oauthState || new Date(oauthState.expires_at).getTime() < Date.now()) {
        return errorResponse('OAuth state expired. Please retry the Buffer connection flow.', 400, 'oauth_state_expired');
      }

      await supabase.from('buffer_oauth_states').delete().eq('nonce', parsedState.nonce);

      const stillAuthorized = await canManageConnection(supabase, oauthState.venue_id, oauthState.user_id);
      if (!stillAuthorized) {
        return errorResponse('Your venue role no longer allows connecting Buffer.', 403, 'forbidden');
      }

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
        return errorResponse(
          tokenData?.error_description ?? tokenData?.error ?? tokenData?.message ?? 'Failed to exchange Buffer OAuth code.',
          400,
          'token_exchange_failed',
        );
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

      if (upsertError) {
        return errorResponse('Failed to save Buffer connection.', 500, 'connection_save_failed', upsertError.message);
      }

      const redirectUrl = new URL(resolveSafeRedirect(oauthState.redirect_to, defaultRedirect));
      redirectUrl.searchParams.set('buffer', 'connected');
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const userId = await getUserIdFromAuthHeader(supabase, req.headers.get('Authorization'));
    if (!userId) return errorResponse('Unauthorized', 401, 'unauthorized');

    if (action === 'start') {
      if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'method_not_allowed');
      if (!clientId || !clientSecret) {
        return errorResponse('Buffer connection is not configured yet.', 200, 'buffer_not_configured');
      }

      const { venue_id, redirect_to } = await req.json();
      if (!venue_id) return errorResponse('venue_id is required', 400, 'missing_venue_id');

      const canManage = await canManageConnection(supabase, venue_id, userId);
      if (!canManage) return errorResponse('Only venue owner/admin can connect Buffer.', 403, 'forbidden');

      const nonce = randomNonce();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error } = await supabase.from('buffer_oauth_states').insert({
        nonce,
        venue_id,
        user_id: userId,
        redirect_to: resolveSafeRedirect(redirect_to, defaultRedirect),
        expires_at: expiresAt,
      });
      if (error) return errorResponse('Failed to initialize OAuth state.', 500, 'oauth_state_insert_failed', error.message);

      const state = base64UrlEncode(JSON.stringify({ nonce }));
      const authUrl = new URL('https://buffer.com/oauth2/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', callbackUrl);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);

      return jsonResponse({ auth_url: authUrl.toString(), callback_url: callbackUrl });
    }

    if (action === 'status') {
      const venueId = url.searchParams.get('venue_id');
      if (!venueId) return errorResponse('venue_id is required', 400, 'missing_venue_id');

      const { data: isMember } = await supabase.rpc('is_venue_member', { check_venue_id: venueId, check_user_id: userId });
      if (!isMember) return errorResponse('Forbidden', 403, 'forbidden');

      const { data, error } = await supabase
        .from('venue_buffer_connections')
        .select('buffer_user_id, connected_at')
        .eq('venue_id', venueId)
        .maybeSingle();

      if (error) return errorResponse('Failed to load Buffer connection status.', 500, 'status_lookup_failed', error.message);
      return jsonResponse({ connected: Boolean(data), connection: data ?? null });
    }

    if (action === 'channels') {
      const venueId = url.searchParams.get('venue_id');
      if (!venueId) return errorResponse('venue_id is required', 400, 'missing_venue_id');

      const { data: isMember } = await supabase.rpc('is_venue_member', { check_venue_id: venueId, check_user_id: userId });
      if (!isMember) return errorResponse('Forbidden', 403, 'forbidden');

      const { data: conn, error: connError } = await supabase
        .from('venue_buffer_connections')
        .select('buffer_access_token')
        .eq('venue_id', venueId)
        .maybeSingle();

      if (connError) return errorResponse('Failed to load Buffer connection.', 500, 'connection_lookup_failed', connError.message);
      if (!conn?.buffer_access_token) return jsonResponse({ connected: false, channels: [] });

      const channelsRes = await fetch('https://api.bufferapp.com/1/profiles.json', {
        headers: { Authorization: `Bearer ${conn.buffer_access_token}` },
      });
      const channelsData = await channelsRes.json();

      if (!channelsRes.ok) {
        return errorResponse(
          channelsData?.error ?? channelsData?.message ?? 'Failed to fetch Buffer channels',
          400,
          'channels_fetch_failed',
          { connected: false },
        );
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
      if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'method_not_allowed');
      const { venue_id } = await req.json();
      if (!venue_id) return errorResponse('venue_id is required', 400, 'missing_venue_id');

      const canManage = await canManageConnection(supabase, venue_id, userId);
      if (!canManage) return errorResponse('Only venue owner/admin can disconnect Buffer.', 403, 'forbidden');

      const { error } = await supabase.from('venue_buffer_connections').delete().eq('venue_id', venue_id);
      if (error) return errorResponse('Failed to disconnect Buffer.', 500, 'disconnect_failed', error.message);
      return jsonResponse({ success: true });
    }

    return errorResponse('Unsupported action', 400, 'unsupported_action');
  } catch (error) {
    console.error('buffer-oauth error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500, 'internal_error');
  }
});
