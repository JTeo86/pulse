-- Buffer publishing V1: OAuth connection + per-venue token storage

CREATE TABLE IF NOT EXISTS public.venue_buffer_connections (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  buffer_access_token text NOT NULL,
  buffer_user_id text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_buffer_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue members can view buffer connection status"
  ON public.venue_buffer_connections
  FOR SELECT
  USING (public.is_venue_member(venue_id, auth.uid()));

CREATE POLICY "Venue admins can manage buffer connections"
  ON public.venue_buffer_connections
  FOR ALL
  USING (public.is_venue_admin(venue_id, auth.uid()))
  WITH CHECK (public.is_venue_admin(venue_id, auth.uid()));

DROP TRIGGER IF EXISTS update_venue_buffer_connections_updated_at ON public.venue_buffer_connections;
CREATE TRIGGER update_venue_buffer_connections_updated_at
  BEFORE UPDATE ON public.venue_buffer_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.buffer_oauth_states (
  nonce text PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  redirect_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.buffer_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to oauth state rows"
  ON public.buffer_oauth_states
  FOR ALL
  USING (false)
  WITH CHECK (false);
