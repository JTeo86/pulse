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

type AdminClient = ReturnType<typeof createClient<any>>;

async function getUserIdFromAuthHeader(supabase: AdminClient, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

async function canPublish(supabase: AdminClient, venueId: string, userId: string) {
  const [{ data: isVenueAdmin }, { data: venueRow }] = await Promise.all([
    supabase.rpc('is_venue_admin', { check_venue_id: venueId, check_user_id: userId }),
    supabase.from('venues').select('owner_user_id').eq('id', venueId).maybeSingle(),
  ]);

  return Boolean(isVenueAdmin || (venueRow?.owner_user_id && String(venueRow.owner_user_id) === userId));
}

function resolveMediaUrl(item: any): string | null {
  if (typeof item.media_master_url === 'string' && item.media_master_url.startsWith('http')) return item.media_master_url;
  const variants = item.media_variants;
  if (!variants || typeof variants !== 'object') return null;

  const queue: unknown[] = [variants];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === 'string' && current.startsWith('http')) return current;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === 'object') {
      queue.push(...Object.values(current as Record<string, unknown>));
    }
  }

  return null;
}

function toBufferScheduledAt(isoString: string | null): { value?: string; error?: string } {
  if (!isoString) return {};
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return { error: 'Invalid scheduled_for timestamp' };
  if (time <= Date.now() + 30_000) return { error: 'scheduled_for must be in the future' };
  return { value: String(Math.floor(time / 1000)) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'method_not_allowed');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const userId = await getUserIdFromAuthHeader(supabase, req.headers.get('Authorization'));
    if (!userId) return errorResponse('Unauthorized', 401, 'unauthorized');

    const body = await req.json();
    const venueId = String(body?.venue_id ?? '');
    const contentIds: string[] = Array.isArray(body?.content_ids) ? body.content_ids.map((id: unknown) => String(id)) : [];
    const profileIds: string[] = Array.isArray(body?.profile_ids) ? body.profile_ids.map((id: unknown) => String(id)) : [];

    if (!venueId || contentIds.length === 0 || profileIds.length === 0) {
      return errorResponse('venue_id, content_ids, and profile_ids are required', 400, 'missing_required_fields');
    }

    const isAllowed = await canPublish(supabase, venueId, userId);
    if (!isAllowed) return errorResponse('Only venue owner/admin can publish to Buffer.', 403, 'forbidden');

    const { data: connection, error: connectionError } = await supabase
      .from('venue_buffer_connections')
      .select('buffer_access_token')
      .eq('venue_id', venueId)
      .maybeSingle();

    if (connectionError) return errorResponse('Failed to load Buffer connection.', 500, 'connection_lookup_failed', connectionError.message);
    if (!connection?.buffer_access_token) {
      return errorResponse('Buffer is not connected for this venue.', 400, 'buffer_not_connected');
    }

    const { data: items, error: itemsError } = await supabase
      .from('content_items')
      .select('id, venue_id, caption_final, status, media_master_url, media_variants, scheduled_for')
      .eq('venue_id', venueId)
      .in('id', contentIds)
      .in('status', ['approved', 'ready', 'failed']);

    if (itemsError) return errorResponse('Failed to load content items.', 500, 'content_lookup_failed', itemsError.message);

    const rows = items ?? [];
    if (rows.length !== contentIds.length) {
      return errorResponse('Some content items were not found or are not in an approved state.', 400, 'invalid_content_selection');
    }

    const orderedRows = contentIds
      .map((id) => rows.find((row) => row.id === id))
      .filter((row): row is NonNullable<typeof rows[number]> => Boolean(row));

    const results: Array<{
      content_id: string;
      ok: boolean;
      error?: string;
      update_id?: string;
      update_ids?: string[];
      status?: 'queued' | 'scheduled';
    }> = [];

    for (const item of orderedRows) {
      const mediaUrl = resolveMediaUrl(item);
      const text = (item.caption_final || '').trim();

      if (!mediaUrl && !text) {
        results.push({ content_id: item.id, ok: false, error: 'Post needs either caption text or a static image.' });
        continue;
      }

      const scheduling = toBufferScheduledAt(item.scheduled_for);
      if (scheduling.error) {
        results.push({ content_id: item.id, ok: false, error: scheduling.error });
        continue;
      }

      const payload = new URLSearchParams();
      profileIds.forEach((id, idx) => payload.append(`profile_ids[${idx}]`, id));
      payload.set('shorten', 'false');
      payload.set('now', 'false');
      if (text) payload.set('text', text);
      if (mediaUrl) payload.set('media[photo]', mediaUrl);
      if (scheduling.value) payload.set('scheduled_at', scheduling.value);

      const sendRes = await fetch('https://api.bufferapp.com/1/updates/create.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.buffer_access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
      });

      const sendData = await sendRes.json();

      if (!sendRes.ok || !sendData?.success) {
        const message = sendData?.message || sendData?.error || sendData?.error_description || 'Failed to send content to Buffer';
        results.push({ content_id: item.id, ok: false, error: String(message) });
        continue;
      }

      const updateIds = Array.isArray(sendData?.updates)
        ? sendData.updates
          .map((update: any) => update?.id)
          .filter((id: unknown): id is string | number => id !== null && id !== undefined)
          .map((id: string | number) => String(id))
        : [];
      const updateId = updateIds[0];
      const nextStatus: 'queued' | 'scheduled' = scheduling.value ? 'scheduled' : 'queued';

      const { error: updateError } = await supabase
        .from('content_items')
        .update({
          status: nextStatus,
          buffer_update_id: updateId ?? null,
          buffer_payload: {
            profile_ids: profileIds,
            update_ids: updateIds,
            sent_at: new Date().toISOString(),
            scheduled_at_unix: scheduling.value ?? null,
            scheduled_for: item.scheduled_for,
            update_count: updateIds.length,
            response_summary: {
              success: Boolean(sendData?.success),
              updates: updateIds.length,
            },
          },
        })
        .eq('id', item.id)
        .eq('venue_id', venueId);

      if (updateError) {
        results.push({ content_id: item.id, ok: false, error: `Buffer send succeeded but save failed: ${updateError.message}` });
        continue;
      }

      results.push({ content_id: item.id, ok: true, update_id: updateId, update_ids: updateIds, status: nextStatus });
    }

    const successCount = results.filter((r) => r.ok).length;
    return jsonResponse({
      success: successCount > 0,
      sent: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (error) {
    console.error('send-to-buffer error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500, 'internal_error');
  }
});
