/**
 * Short-Time Fourier Transform (STFT) and Audio Fingerprinting utility.
 * Ported from Python/Librosa logic for the Chordial project.
 */

/**
 * Basic FFT implementation (Cooley-Tukey).
 * @param re Real parts (modified in place)
 * @param im Imaginary parts (modified in place)
 */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Iterative FFT
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = -Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const tmpRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = tmpRe;
      }
    }
  }
}

/**
 * Computes the Short-Time Fourier Transform (STFT) magnitude.
 * Matches librosa.stft(y, n_fft, hop_length) logic.
 */
export function computeSTFT(y: Float32Array, nFFT: number = 2048, hopLength: number = 512, center: boolean = false): number[][] {
  const numFrames = Math.floor((y.length - nFFT) / hopLength) + 1;
  if (numFrames <= 0) return [];

  // Hann window
  const window = new Float32Array(nFFT);
  for (let i = 0; i < nFFT; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nFFT - 1)));
  }

  const magnitude: number[][] = Array.from({ length: nFFT / 2 + 1 }, () => new Array(numFrames));

  for (let t = 0; t < numFrames; t++) {
    const start = t * hopLength;
    const re = new Float32Array(nFFT);
    const im = new Float32Array(nFFT);
    for (let j = 0; j < nFFT; j++) {
      re[j] = y[start + j] * window[j];
    }
    fft(re, im);
    
    // Only need positive frequencies
    for (let f = 0; f <= nFFT / 2; f++) {
      magnitude[f][t] = Math.sqrt(re[f] * re[f] + im[f] * im[f]);
    }
  }
  
  return magnitude;
}

/**
 * Finds spectral peaks from the STFT magnitude matrix.
 * Matches the constellation map logic.
 */
export function getPeaks(
  D: number[][],
  sr: number,
  nFFT: number = 2048,
  hopLength: number = 512,
  neighborhood: number = 20,
  thresholdMultiplier: number = 2.0
): [number, number][] {
  if (D.length === 0) return [];

  const numFreqs = D.length;
  const numFrames = D[0].length;
  
  // Compute mean and max for thresholding
  let sum = 0;
  let maxMag = 0;
  for (let f = 0; f < numFreqs; f++) {
    for (let t = 0; t < numFrames; t++) {
      const val = D[f][t];
      sum += val;
      if (val > maxMag) maxMag = val;
    }
  }
  const mean = sum / (numFreqs * numFrames);
  const threshold = mean * thresholdMultiplier;

  const peaks: [number, number][] = [];
  const halfNH = Math.floor(neighborhood / 2);

  for (let f = 0; f < numFreqs; f++) {
    for (let t = 0; t < numFrames; t++) {
      const val = D[f][t];
      if (val <= threshold || val === 0) continue;

      // Local max filter (2D)
      let isMax = true;
      for (let df = -halfNH; df <= halfNH; df++) {
        for (let dt = -halfNH; dt <= halfNH; dt++) {
          const nf = f + df;
          const nt = t + dt;
          if (nf >= 0 && nf < numFreqs && nt >= 0 && nt < numFrames) {
            if (D[nf][nt] > val) {
              isMax = false;
              break;
            }
          }
        }
        if (!isMax) break;
      }

      if (isMax) {
        const freq = (f * sr) / nFFT;
        const time = (t * hopLength) / sr;
        peaks.push([time, freq]);
      }
    }
  }

  // Sort chronologically
  return peaks.sort((a, b) => a[0] - b[0]);
}

/**
 * Simple SHA1 implementation in pure JS.
 * Used to avoid external dependencies for basic fingerprinting.
 */
function sha1(str: string): string {
  function rotateLeft(n: number, s: number) {
    return (n << s) | (n >>> (32 - s));
  }

  // Simple string to byte array conversion (works for ASCII/UTF-8 subset used here)
  const buffer = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) buffer.push(c);
    else if (c < 2048) buffer.push((c >> 6) | 192, (c & 63) | 128);
    else buffer.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
  }

  const l = buffer.length;
  const n = ((l + 8) >> 6) + 1;
  const words = new Uint32Array(n * 16);

  for (let i = 0; i < l; i++) {
    words[i >> 2] |= buffer[i] << (24 - (i % 4) * 8);
  }
  words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  words[n * 16 - 1] = l * 8;

  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;
  let h4 = 0xC3D2E1F0;

  for (let i = 0; i < n * 16; i += 16) {
    const w = new Uint32Array(80);
    for (let j = 0; j < 16; j++) w[j] = words[i + j];
    for (let j = 16; j < 80; j++) w[j] = rotateLeft(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5A827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

/**
 * Generate fingerprints from peak pairs.
 * Matches logic: SHA1 hash of "f1|f2|dt"
 */
export function generateFingerprints(
  peaks: [number, number][],
  fanOut: number = 15,
  maxDt: number = 2.0
): [string, number][] {
  const fingerprints: [string, number][] = [];
  for (let i = 0; i < peaks.length; i++) {
    const [t1, f1] = peaks[i];
    for (let j = 1; j <= fanOut; j++) {
      if (i + j >= peaks.length) break;

      const [t2, f2] = peaks[i + j];
      const dt = t2 - t1;

      if (dt > 0 && dt < maxDt) {
        // Round frequencies to nearest Hz and dt to 2 decimal places to prevent float drift
        const raw = `${Math.round(f1)}|${Math.round(f2)}|${dt.toFixed(2)}`;
        console.log(raw);
        const fpHashing = sha1(raw);
        fingerprints.push([fpHashing, t1]);
      }
    }
  }
  return fingerprints;
}
