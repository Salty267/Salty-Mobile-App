import { useCallback, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase/client';

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';

const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export type ExportStatus = 'idle' | 'authorizing' | 'searching' | 'creating' | 'done' | 'error';

export function useSpotifyExport() {
  const [status, setStatus]       = useState<ExportStatus>('idle');
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const redirectUri = makeRedirectUri({ scheme: 'salty', path: 'auth/callback' });

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: ['playlist-modify-private', 'playlist-modify-public', 'user-read-private'],
      usePKCE: true,
      redirectUri,
    },
    DISCOVERY,
  );

  const exportToSpotify = useCallback(async (
    songs: Array<{ song: string }>,
    artistName: string,
  ) => {
    setStatus('authorizing');
    setErrorMsg(null);
    setPlaylistUrl(null);

    try {
      const authResult = await promptAsync();
      if (authResult.type !== 'success') {
        setStatus('idle');
        return;
      }

      const { code } = authResult.params;
      const codeVerifier = request?.codeVerifier;
      if (!codeVerifier) throw new Error('Missing PKCE code verifier');

      const exchangeResp = await supabase.functions.invoke('spotify-export', {
        body: { action: 'exchange', code, codeVerifier, redirectUri },
      });
      if (exchangeResp.error) throw new Error('Token exchange failed');
      const { access_token: accessToken } = exchangeResp.data;

      const profileResp = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileResp.json();
      const spotifyUserId: string = profile.id;

      setStatus('searching');
      const trackUris: string[] = [];
      for (const { song } of songs) {
        const searchResp = await supabase.functions.invoke('spotify-export', {
          body: { action: 'search', accessToken, query: `${song} ${artistName}` },
        });
        if (searchResp.data?.trackUri) {
          trackUris.push(searchResp.data.trackUri);
        }
      }

      if (trackUris.length === 0) throw new Error('No songs found on Spotify');

      setStatus('creating');
      const createResp = await supabase.functions.invoke('spotify-export', {
        body: {
          action: 'create_playlist',
          accessToken,
          userId: spotifyUserId,
          playlistName: `${artistName} – Salty Setlist`,
          trackUris,
        },
      });
      if (createResp.error || !createResp.data?.playlistUrl) throw new Error('Playlist creation failed');

      setPlaylistUrl(createResp.data.playlistUrl);
      setStatus('done');
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Something went wrong');
      setStatus('error');
    }
  }, [request, promptAsync, redirectUri]);

  return { exportToSpotify, status, playlistUrl, errorMsg };
}
