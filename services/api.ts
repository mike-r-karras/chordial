import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface SongMatch {
  title: string;
  artist: string;
  chordChartUrl: string;
}

const FRAGMENTS_URL = 'https://chordial-api.mike-r-karras.workers.dev/fragments';
const AUTH_TOKEN = '5d3c8f8b6b9f4f0e9f8f3d8c7a1b2e4f6c9d0a8b7e3f1c2d4a5b6c7d8e9f0a1';

export async function identifySongFromAudio(uri: string): Promise<SongMatch | null> {
  try {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((r) => r.blob());
      form.append('audio', blob, 'capture.m4a');
    } else {
      form.append('audio', {
        uri,
        name: 'capture.m4a',
        type: 'audio/m4a',
      } as any);
    }

    const response = await fetch(FRAGMENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      body: form,
    });

    if (!response.ok) {
      console.warn(`[API] /fragments returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (result?.match) {
      return {
        title: result.match.title,
        artist: result.match.artist,
        chordChartUrl: result.match.chordChartUrl,
      };
    }
    return null;
  } catch (e) {
    console.error('[API] /fragments request failed:', e);
    return null;
  } finally {
    if (Platform.OS === 'web') {
      try { URL.revokeObjectURL(uri); } catch {}
    } else {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }
}
