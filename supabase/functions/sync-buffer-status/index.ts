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

async function getUserIdFromAuthHeader(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

async function canPublish(supabase: ReturnType<typeof createClient>, venueId: string, userId: string) {
  const [{ data: isVenueAdmin }, { data: venueRow }] = await Promise.all([
    supabase.rpc('is_venue_admin', { check_venue_id: venueId, check_user_id: userId }),
    supabase.from('venues').select('owner_user_id').eq('id', venueId).maybeSingle(),
  ]);

  return Boolean(isVenueAdmin || (venueRow?.owner_user_id && String(venueRow.owner_user_id) === userId));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'method_not_allowed');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const userId = await getUserIdFromAuthHeader(supabase, req.headers.get('Authorization'));
    if (!userId) return errorResponse('Unauthorized', 401, 'unauthorized');

    const body = await req.json();
    const venueId = String(body?.venue_id ?? '');
    if (!venueId) return errorResponse('venue_id is required', 400, 'missing_venue_id');

    const isAllowed = await canPublish(supabase, venueId, userId);
    if (!isAllowed) return errorResponse('Only venue owner/admin can refresh Buffer status.', 403, 'forbidden');

    const { data: connection } = await supabase
      .from('venue_buffer_connections')
      .select('buffer_access_token')
      .eq('venue_id', venueId)
      .maybeSingle();

    if (!connection?.buffer_access_token) {
      return errorResponse('Buffer is not connected for this venue.', 400, 'buffer_not_connected');
    }

    const { data: items, error: itemsError } = await supabase
      .from('content_items')
      .select('id, buffer_update_id, status')
      .eq('venue_id', venueId)
      .in('status', ['queued', 'scheduled'])
      .not('buffer_update_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(25);

    if (itemsError) return errorResponse('Failed loading content items.', 500, 'content_lookup_failed', itemsError.message);

    const results: Array<{ content_id: string; ok: boolean; status?: string; error?: string }> = [];

    for (const item of items ?? []) {
      const updateRes = await fetch(`https://api.bufferapp.com/1/updates/${item.buffer_update_id}.json`, {
        headers: { Authorization: `Bearer ${connection.buffer_access_token}` },
      });

      const updateData = await updateRes.json();
      if (!updateRes.ok) {
        results.push({ content_id: item.id, ok: false, error: updateData?.error ?? updateData?.message ?? 'Failed to fetch Buffer update' });
        continue;
      }

      const bufferStatus = String(updateData?.status ?? '').toLowerCase();
      const dueAt = updateData?.due_at ? new Date(updateData.due_at).getTime() : null;
      let mappedStatus: 'queued' | 'scheduled' | 'published' = 'queued';

      if (bufferStatus === 'sent') {
        mappedStatus = 'published';
      } else if (typeof dueAt === 'number' && !Number.isNaN(dueAt) && dueAt > Date.now()) {
        mappedStatus = 'scheduled';
      }

      const { error: updateError } = await supabase
        .from('content_items')
        .update({ status: mappedStatus })
        .eq('id', item.id)
        .eq('venue_id', venueId);

      if (updateError) {
        results.push({ content_id: item.id, ok: false, error: updateError.message });
        continue;
      }

      results.push({ content_id: item.id, ok: true, status: mappedStatus });
    }

    const synced = results.filter((r) => r.ok).length;
    return jsonResponse({ success: true, synced, failed: results.length - synced, results });
  } catch (error) {
    console.error('sync-buffer-status error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500, 'internal_error');
  }
});
