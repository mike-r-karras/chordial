import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface SongMatch {
  title: string;
  artist: string;
  chordChartUrl: string;
}

const FRAGMENTS_URL = 'https://chordial-api.mike-r-karras.workers.dev/fragments';
const AUTH_TOKEN = '5d3c8f8b6b9f4f0e9f8f3d8c7a1b2e4f6c9d0a8b7e3f1c2d4a5b6c7d8e9f0a1';

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY MOCK — for testing the chord-chart feature while the backend is
// down. To restore real backend calls, set USE_MOCK = false (or delete this
// whole block plus the early-return below).
//
// To test different scenarios, change MOCK_MATCH.title:
//   • A title that exists in sjuc_songs.json  → PDF viewer opens (happy path)
//   • A title NOT in sjuc_songs.json          → "Chord chart not available" alert
//   • Set MOCK_MATCH = null                   → "Song Not Found" alert
// ─────────────────────────────────────────────────────────────────────────────
const USE_MOCK = true;
const MOCK_MATCH: SongMatch | null = {
  title: 'Hey Jude',
  artist: 'The Beatles',
  chordChartUrl: '', // unused — URL is now sourced from sjuc_songs.json
};

export async function identifySongFromAudio(uri: string): Promise<SongMatch | null> {
  if (USE_MOCK) {
    // Pretend we called the server: tiny delay so the "Identifying song..."
    // spinner is briefly visible, then return the mock result.
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Clean up the recorded file, same as the real path does in `finally`.
    if (Platform.OS === 'web') {
      try { URL.revokeObjectURL(uri); } catch {}
    } else {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
    return MOCK_MATCH;
  }

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
