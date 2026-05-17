import { File } from 'expo-file-system';
import { AudioModule } from 'expo-audio';
import { computeSTFT, generateFingerprints, getPeaks } from './fingerprinting';

export interface SongMatch {
  title: string;
  artist: string;
  chordChartUrl: string;
}

export interface Fingerprint {
  hash: string;
  offset: number;
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
      player = new AudioModule.AudioPlayer(source, 10, false, 0);
    } catch (e) {
      try {
        player = new AudioModule.AudioPlayer(source as any, 10, false);
      } catch (e2) {
        console.error('[API] Failed to create AudioPlayer:', e2);
        resolve(new Float32Array(0));
        return;
      }
    }
    
    try {
      player.volume = 0.05; // Low volume for sampling
      if (typeof player.setPlaybackRate === 'function') {
        player.setPlaybackRate(1.0);
      } else {
        player.playbackRate = 1.0;
      }
    } catch (e) {
      console.warn('[API] Player config error:', e);
    }
    
    const allFrames: number[] = [];
    
    player.addListener('audioSampleUpdate', (data: any) => {
      if (data.channels.length > 0) {
        allFrames.push(...data.channels[0].frames);
      }
    });

    player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.isLoaded && !hasStarted) {
        hasStarted = true;
        player.setAudioSamplingEnabled(true);
        player.play();
      }

      if (status.didJustFinish) {
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

    setTimeout(() => {
      if (allFrames.length === 0 || !hasStarted) {
        player.remove();
        console.warn('[API] Extraction timeout');
        resolve(new Float32Array(allFrames));
      }
    }, 25000);
  });
}

/**
 * Loads audio data from a URI and returns PCM samples as a Float32Array.
 * Implements a basic WAV parser, falling back to playback extraction for other formats.
 */
async function loadAudioAsPCM(audioUri: string): Promise<Float32Array> {
  try {
    const file = new File(audioUri);
    const info = await file.info();

    if (!info.exists) {
      console.warn('[API] Audio file does not exist');
      return new Float32Array(0);
    }

    // Read file header to determine format
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isWave = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;

    if (isRiff && isWave) {
      // Basic WAV parsing: Find the "data" chunk
      let dataOffset = -1;
      for (let i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x64 && bytes[i+1] === 0x61 && bytes[i+2] === 0x74 && bytes[i+3] === 0x61) {
          dataOffset = i + 8;
          break;
        }
      }

      if (dataOffset === -1) {
        console.warn('[API] Could not find data chunk in WAV file');
        return new Float32Array(0);
      }

      const dataView = new DataView(bytes.buffer);
      const numSamples = Math.floor((bytes.length - dataOffset) / 2);
      const pcm = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(dataOffset + i * 2, true);
        pcm[i] = sample / 32768.0;
      }
      return pcm;
    } else {
      return await extractPCMFromPlayback(audioUri);
    }
  } catch (e) {
    console.error('[API] Error loading PCM:', e);
    return new Float32Array(0);
  }
}

/**
 * Fingerprints an audio bite using the STFT and constellation map logic.
 * @param audioUri URI of the audio file or segment.
 * @returns An array of fingerprint objects.
 */
export async function fingerprintAudio(audioUri: string): Promise<Fingerprint[]> {
  const SAMPLE_RATE = 22050;
  const pcmData = await loadAudioAsPCM(audioUri);
  
  if (pcmData.length === 0) {
    return [];
  }

  // 1. Extract peaks
  const magnitude = computeSTFT(pcmData);
  const peaks = getPeaks(magnitude, SAMPLE_RATE, 2048, 512, 5, 1.1);
  
  // 2. Generate fingerprints
  const fps = generateFingerprints(peaks);
  console.log(`[API] Generated ${fps.length} fingerprints`);

  // Log first 10 fingerprints for debugging
  console.log('[API] First 10 fingerprints:', JSON.stringify(fps.slice(0, 10).map(fp => ({ hash: fp[0], offset: fp[1] })), null, 2));
  console.log('[API] First 10 hashes:', JSON.stringify(fps.slice(0, 10).map(fp => fp[0]), null, 2));
  
  return fps.map(fp => ({
    hash: fp[0],
    offset: fp[1]
  }));
}

/**
 * Identifies a song by searching the backend database via the Cloudflare Worker API.
 * @param fingerprints Flat array of all fingerprint objects collected.
 * @returns A SongMatch object or null if no match found.
 */
export async function identifySong(fingerprints: Fingerprint[]): Promise<SongMatch | null> {
  const LOOKUP_URL = 'https://chordial-api.mike-r-karras.workers.dev/lookup';
  console.log(`[API] Searching database with ${fingerprints.length} hashes...`);

  if (fingerprints.length === 0) return null;

  try {
    const response = await fetch(LOOKUP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 5d3c8f8b6b9f4f0e9f8f3d8c7a1b2e4f6c9d0a8b7e3f1c2d4a5b6c7d8e9f0a1'
      },
      body: JSON.stringify({
        fingerprints: fingerprints
      }),
    });

    console.log(`[API] Lookup Status: ${response.status} ${response.statusText}`);
    
    const result = await response.json();
    console.log(`[API] Lookup Response:`, JSON.stringify(result, null, 2));

    if (response.ok && result.match) {
      console.log(`[API] Match found: ${result.match.title} by ${result.match.artist}`);
      return {
        title: result.match.title,
        artist: result.match.artist,
        chordChartUrl: result.match.chordChartUrl || "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
      };
    }

    return null;
  } catch (e) {
    console.error('[API] Lookup Request failed:', e);
    return null;
  }
}

/**
 * Simulates fetching a chord chart PDF for a song.
 * @param songTitle The title of the song.
 * @returns A dummy local URI or placeholder URL for the PDF.
 */
export async function fetchChordChart(songTitle: string): Promise<string> {
  console.log(`[API Stub] Fetching chord chart for: ${songTitle}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
}
