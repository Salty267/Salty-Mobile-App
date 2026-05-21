import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const payload = await req.json() as {
    action?: 'delete';
    userId: string;
    requesterId?: string;
    title?: string;
    body?: string;
    data?: { screen?: string; prefKey?: string; requesterId?: string };
  };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Delete action: remove the matching notification
  if (payload.action === 'delete' && payload.requesterId) {
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', payload.userId)
      .contains('data', { requesterId: payload.requesterId, screen: 'friends' });
    return new Response('Deleted', { status: 200 });
  }

  const { userId, title, body, data } = payload as {
    userId: string; title: string; body: string;
    data?: { screen?: string; prefKey?: string; requesterId?: string };
  };

  // Always write to inbox first — the in-app notification centre depends on this
  // regardless of whether the user has a push token or not.
  await supabase.from('notifications').insert({ user_id: userId, title, body, data });

  // Check preference — if muted, skip push but inbox row is already written
  if (data?.prefKey) {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select(data.prefKey)
      .eq('user_id', userId)
      .single();

    if (prefs && !prefs[data.prefKey]) return new Response('Muted', { status: 200 });
  }

  // Attempt push — best-effort, no token means no push (e.g. Expo Go or first install)
  const { data: tokenRow } = await supabase
    .from('notification_tokens')
    .select('token')
    .eq('user_id', userId)
    .single();

  if (!tokenRow) return new Response('No push token', { status: 200 });

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: tokenRow.token, title, body, data }),
  });

  return new Response(await res.text(), { status: res.status });
});
