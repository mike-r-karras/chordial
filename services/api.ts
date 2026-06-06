import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface SongMatch {
  title: string;
  artist: string;
  chordChartUrl: string;
}

// const FRAGMENTS_URL = 'https://chordial-api-616025745588.us-west1.run.app/fragments';
const FRAGMENTS_URL = 'https://chordial-fingerprint-api-616025745588.us-west1.run.app/fragments';
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
const USE_MOCK = false;
const MOCK_MATCH: SongMatch | null = {
  title: 'Hey Jude',
  artist: 'The Beatles',
  chordChartUrl: '', // unused — URL is now sourced from sjuc_songs.json
};

async function cleanupAudio(uri: string) {
  if (Platform.OS === 'web') {
    try {
      URL.revokeObjectURL(uri);
    } catch (e) {
      console.warn('[API] Failed to revoke object URL:', e);
    }
  } else {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (e) {
      console.warn('[API] Failed to delete audio file:', e);
    }
  }
}

async function uploadAudio(uri: string): Promise<Response> {
  const commonHeaders: HeadersInit = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
  };

  if (Platform.OS === 'web') {
    const originalBlob = await fetch(uri).then((r) => r.blob());
    // Use the original blob's type for the Content-Type header
    const contentType = originalBlob.type || 'audio/m4a'; 

    return fetch(FRAGMENTS_URL, {
      method: 'POST',
      headers: {
        ...commonHeaders,
        'Content-Type': contentType,
      },
      body: originalBlob,
    });
  }

  const form = new FormData();
  form.append('audio', {
    uri,
    name: 'capture.m4a',
    type: 'audio/m4a',
  } as any);

  return fetch(FRAGMENTS_URL, {
    method: 'POST',
    headers: commonHeaders,
    body: form,
  });
}

export async function identifySongFromAudio(uri: string): Promise<SongMatch | null> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await cleanupAudio(uri);
    return MOCK_MATCH;
  }

  try {
    const response = await uploadAudio(uri);

    if (!response.ok) {
      console.warn(`[API] /fragments returned ${response.status}`);
      return null;
    }

    const result = await response.json();
    console.log('[API] /fragments response:', result);

    const results = result.results || [];
    if (result.success && results.length > 0) {
      // Pick highest confidence, or the first match if confidences are equal
      const topResult = results.reduce((best: any, current: any) =>
        current.confidence > best.confidence ? current : best
      );
      
      console.log('[API] topResult:', topResult);

      return {
        title: topResult.song.name,
        artist: topResult.song.artist,
        // Priority: specific result URL -> top-level match URL -> empty
        chordChartUrl: topResult.song.chordChartUrl || result.match?.chordChartUrl || '',
      };
    }

    return null;
  } catch (e) {
    console.error('[API] /fragments request failed:', e);
    return null;
  } finally {
    await cleanupAudio(uri);
  }
}
