import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt ?? '');
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {}

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')!;
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;

  if (body.action === 'exchange') {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri: body.redirectUri,
      client_id: clientId,
      code_verifier: body.codeVerifier,
    });
    const resp = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: params,
    });
    const data = await resp.json();
    return new Response(JSON.stringify(data), { headers: CORS });
  }

  if (body.action === 'search') {
    const q = encodeURIComponent(body.query);
    const resp = await fetch(
      `${SPOTIFY_API}/search?q=${q}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${body.accessToken}` } },
    );
    const data = await resp.json();
    const uri = data.tracks?.items?.[0]?.uri ?? null;
    return new Response(JSON.stringify({ trackUri: uri }), { headers: CORS });
  }

  if (body.action === 'create_playlist') {
    const createResp = await fetch(
      `${SPOTIFY_API}/users/${body.userId}/playlists`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${body.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.playlistName, public: false, description: 'Exported from Salty' }),
      },
    );
    const playlist = await createResp.json();
    if (!playlist.id) {
      return new Response(JSON.stringify({ error: 'Playlist creation failed' }), { status: 500, headers: CORS });
    }
    for (let i = 0; i < body.trackUris.length; i += 100) {
      const chunk = body.trackUris.slice(i, i + 100);
      await fetch(`${SPOTIFY_API}/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${body.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: chunk }),
      });
    }
    return new Response(
      JSON.stringify({ playlistUrl: playlist.external_urls?.spotify }),
      { headers: CORS },
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
});
