import * as Linking from 'expo-linking';

export async function openAppleMusicSearch(query: string): Promise<void> {
  const encoded = encodeURIComponent(query);
  const nativeUrl = `music://music.apple.com/us/search?term=${encoded}`;
  const webUrl = `https://music.apple.com/us/search?term=${encoded}`;
  const canOpen = await Linking.canOpenURL(nativeUrl);
  await Linking.openURL(canOpen ? nativeUrl : webUrl);
}

export async function openYouTubeMusicSearch(
  songs: Array<{ song: string }>,
  artistName: string,
): Promise<void> {
  const terms = songs.slice(0, 5).map(s => s.song).join(' ');
  const query = `${artistName} ${terms} setlist`;
  const encoded = encodeURIComponent(query);
  await Linking.openURL(`https://music.youtube.com/search?q=${encoded}`);
}
