import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // User client — scoped to the caller, respects RLS
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uid = user.id;

    // Admin client — uses service role to bypass RLS and delete auth user
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Delete all user data in parallel
    await Promise.all([
      adminClient.from('tickets').delete().eq('user_id', uid),
      adminClient.from('wishlists').delete().eq('user_id', uid),
      adminClient.from('saved_events').delete().eq('user_id', uid),
      adminClient.from('gmail_connections').delete().eq('user_id', uid),
      adminClient.from('friendships').delete().or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
      adminClient.storage.from('avatars').remove([
        `${uid}/avatar.jpg`,
        `${uid}/avatar.jpeg`,
        `${uid}/avatar.png`,
        `${uid}/avatar.webp`,
      ]),
    ]);

    // Delete from public users table
    await adminClient.from('users').delete().eq('id', uid);

    // Delete the auth user — this is what actually prevents re-login
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(uid);
    if (deleteErr) {
      console.error('auth.admin.deleteUser failed:', deleteErr);
      return new Response(JSON.stringify({ error: 'Failed to delete auth user' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('delete-account error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});