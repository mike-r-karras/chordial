import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { AudioModule, createAudioPlayer } from 'expo-audio';

export interface SongMatch {
  title: string;
  artist: string;
  chordChartUrl: string;
  coverArt?: string;
}

const SHAZAM_API_URL = 'https://shazam.p.rapidapi.com/songs/v3/detect?timezone=America%2FLos_Angeles&locale=en-US';
const RAPIDAPI_HOST = 'shazam.p.rapidapi.com';
const RAPIDAPI_KEY = '24adfca940msh3c2c6476b9eb1f6p1d5acbjsn42c64728d190';

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

/**
 * Extracts PCM samples from any audio file by playing it silently and sampling the output.
 * This is a workaround for Android where MediaRecorder doesn't support WAV/PCM directly.
 */
async function extractPCMFromPlayback(audioUri: string): Promise<Float32Array> {
  return new Promise(async (resolve) => {
    let player: any;
    const source = { uri: audioUri };
    let hasStarted = false;
    
    try {
      player = createAudioPlayer(source, { updateInterval: 10 });
    } catch (e) {
      try {
        player = new AudioModule.AudioPlayer(source, 10, false, 0);
      } catch (e2) {
        try {
          player = new AudioModule.AudioPlayer(source as any, 10, false, 0);
        } catch (e3) {
          console.error('[API] Failed to create AudioPlayer:', e3);
          resolve(new Float32Array(0));
          return;
        }
      }
    }
    
    try {
      player.volume = 0.05; // Low volume for silent playback sampling
      if (typeof player.setPlaybackRate === 'function') {
        player.setPlaybackRate(1.0);
      } else {
        player.playbackRate = 1.0;
      }
    } catch (e) {
      console.warn('[API] Player config error:', e);
    }
    
    const allFrames: number[] = [];
    
    const subscription = player.addListener('audioSampleUpdate', (data: any) => {
      if (data.channels.length > 0) {
        allFrames.push(...data.channels[0].frames);
      }
    });

    const statusSubscription = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.isLoaded && !hasStarted) {
        hasStarted = true;
        player.setAudioSamplingEnabled(true);
        player.play();
      }

      if (status.didJustFinish) {
        subscription.remove();
        statusSubscription.remove();
        player.remove();
        console.log(`[API] PCM Extraction complete. Samples: ${allFrames.length}`);
        resolve(new Float32Array(allFrames));
      }
    });

    if (player.isLoaded && !hasStarted) {
      hasStarted = true;
      player.setAudioSamplingEnabled(true);
      player.play();
    }

    // Extraction fallback timeout
    setTimeout(() => {
      if (allFrames.length === 0 || !hasStarted) {
        subscription.remove();
        statusSubscription.remove();
        player.remove();
        console.warn('[API] Extraction timeout');
        resolve(new Float32Array(allFrames));
      }
    }, 10000);
  });
}

/**
 * Resamples any audio blob on Web using standard Web Audio APIs.
 */
async function getPCMFromWebAudio(uri: string): Promise<Float32Array> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const targetSampleRate = 44100;
  const OfflineAudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineCtx = new OfflineAudioContextClass(
    1, // mono
    audioBuffer.duration * targetSampleRate,
    targetSampleRate
  );

  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start();

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0); // Float32Array of 44100Hz mono samples
}

/**
 * Converts Float32Array samples to signed 16-bit little-endian PCM bytes.
 */
function float32To16BitPCM(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(i * 2, val, true); // true = little-endian
  }
  return buffer;
}

/**
 * High-performance, cross-platform Base64 encoder for ArrayBuffers.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (Platform.OS === 'web') {
    return window.btoa(binary);
  } else {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64 = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 3) {
      const b1 = bytes[i];
      const b2 = i + 1 < len ? bytes[i + 1] : 0;
      const b3 = i + 2 < len ? bytes[i + 2] : 0;
      
      const enc1 = b1 >> 2;
      const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
      const enc3 = i + 1 < len ? ((b2 & 15) << 2) | (b3 >> 6) : 64;
      const enc4 = i + 2 < len ? b3 & 63 : 64;
      
      base64 += chars.charAt(enc1) +
                chars.charAt(enc2) +
                (enc3 === 64 ? '=' : chars.charAt(enc3)) +
                (enc4 === 64 ? '=' : chars.charAt(enc4));
    }
    return base64;
  }
}

export async function identifySongFromAudio(uri: string): Promise<SongMatch | null> {
  try {
    console.log('[API] Extracting PCM samples from recording...');
    let samples: Float32Array;

    if (Platform.OS === 'web') {
      samples = await getPCMFromWebAudio(uri);
    } else {
      samples = await extractPCMFromPlayback(uri);
    }

    if (samples.length === 0) {
      console.warn('[API] Extracted PCM buffer is empty');
      return null;
    }

    console.log(`[API] Extracted ${samples.length} float samples. Converting to 16-bit little-endian...`);
    const pcmBuffer = float32To16BitPCM(samples);
    
    console.log(`[API] PCM buffer size: ${pcmBuffer.byteLength} bytes. Encoding to Base64...`);
    const base64Audio = bufferToBase64(pcmBuffer);

    console.log(`[API] Base64 string length: ${base64Audio.length} characters. Uploading to Shazam API...`);

    const response = await fetch(SHAZAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY,
      },
      body: base64Audio,
    });

    if (!response.ok) {
      console.warn(`[API] Shazam API returned status ${response.status}: ${response.statusText}`);
      return null;
    }

    const result = await response.json();
    console.log('[API] Shazam API response:', result);

    if (result && result.results && result.results.matches && result.results.matches.length > 0) {
      const firstMatch = result.results.matches[0];
      const matchType = firstMatch.type;
      const matchId = firstMatch.id;
      const songDetails = result.resources?.[matchType]?.[matchId];

      if (songDetails && songDetails.attributes) {
        const track = songDetails.attributes;
        console.log(`[API] Match found: "${track.title}" by ${track.artist}`);
        
        return {
          title: track.title || 'Unknown Title',
          artist: track.artist || 'Unknown Artist',
          coverArt: track.images?.coverArt || '',
          chordChartUrl: '', // Fall back to local uketunes.firebasestorage.app via index.tsx
        };
      }
    }

    console.log('[API] No match found');
    return null;
  } catch (e) {
    console.error('[API] Shazam identification failed:', e);
    return null;
  } finally {
    await cleanupAudio(uri);
  }
}
