/**
 * Stubs for Chordial API services.
 */

export interface SongMatch {
  title: string;
  artist: string;
  chordChartUrl: string;
}

/**
 * Simulates fingerprinting an audio bite.
 * @param audioUri URI of the audio file or segment.
 * @returns A dummy fingerprint string.
 */
export async function fingerprintAudio(audioUri: string): Promise<string> {
  console.log(`[API Stub] Fingerprinting audio: ${audioUri}`);
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return `fingerprint_${Math.random().toString(36).substring(7)}`;
}

/**
 * Simulates sending fingerprints to an API to identify a song.
 * @param fingerprints Array of audio fingerprints.
 * @returns A SongMatch object or null if no match found.
 */
export async function identifySong(fingerprints: string[]): Promise<SongMatch | null> {
  console.log(`[API Stub] Identifying song with ${fingerprints.length} fingerprints...`);
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Simulate a 20% chance of failure to test the "Not Found" modal
  if (fingerprints.length > 0 && Math.random() > 0.2) {
    return {
      title: "Bohemian Rhapsody",
      artist: "Queen",
      chordChartUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
    };
  }
  return null;
}

/**
 * Simulates fetching a chord chart PDF for a song.
 * @param songTitle The title of the song.
 * @returns A dummy local URI or placeholder URL for the PDF.
 */
export async function fetchChordChart(songTitle: string): Promise<string> {
  console.log(`[API Stub] Fetching chord chart for: ${songTitle}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  // In a real app, this might download a file to the local filesystem.
  return "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
}
