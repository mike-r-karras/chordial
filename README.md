# Chordial

Chordial is a one-button song recognizer for ukulele players. Point your phone at a speaker (or just at whatever's playing in the room), tap the logo, and ten seconds later it tells you the song and hands you a ukulele chord chart as a shareable PDF.

It's a [Shazam-style](https://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf) acoustic fingerprinter built end-to-end in TypeScript on top of [Expo](https://expo.dev) / React Native, with a Cloudflare Worker handling the hash lookup against a small song library.

## How it works

The whole pipeline runs in four stages, kicked off by a single tap on the home screen.

### 1. Capture (`hooks/use-audio-processor.ts`)

The home screen calls `startSearchRecording()` which:

- Configures `expo-audio` to record a 10-second clip as AAC in an M4A container, mono, 22050 Hz, 64 kbps — the same sample rate the fingerprinter expects.
- Streams `metering` values to the UI while recording, which drives the pulsing animation on the capture button (see `interpolate` in `app/(tabs)/index.tsx`).
- After 10 seconds, stops the recorder and hands the file URI to `fingerprintAudio()`.

State flags (`isRecording`, `isSearching`, `match`) are exposed to the screen so the button can show an indicator and disable retaps mid-search.

### 2. PCM decoding (`services/api.ts`)

Fingerprinting needs raw float samples, not encoded audio. `loadAudioAsPCM()` handles two cases:

- **WAV files** — Detects the `RIFF`/`WAVE` header, finds the `data` chunk by scanning bytes, and decodes signed 16-bit little-endian samples into a `Float32Array` (normalized to `[-1, 1]`).
- **Anything else (AAC/M4A in practice)** — Falls back to `extractPCMFromPlayback()`, which loads the file into an `AudioModule.AudioPlayer`, mutes it to ~5% volume, enables `audioSampleUpdate` events, plays the clip through, and collects the channel-0 frames as they're emitted. The audio is decoded by the OS's media stack and we just observe the PCM going by.

### 3. Fingerprinting (`services/fingerprinting.ts`)

A pure-JS implementation of the constellation-map fingerprinting algorithm:

- **`computeSTFT(y)`** — Hann-windowed Short-Time Fourier Transform with `n_fft = 2048`, `hop_length = 512`. Uses an in-place iterative Cooley–Tukey FFT (`fft()`) and returns the magnitude spectrogram as `[freq_bin][time_frame]`.
- **`getPeaks(D, sr, …)`** — Picks spectral peaks by combining a mean-magnitude threshold (`mean * 1.1`) with a 2D local-max filter over a 20×20 neighborhood. Each surviving peak is converted from `(bin, frame)` to `(time_seconds, freq_hz)` and sorted chronologically.
- **`generateFingerprints(peaks)`** — For each anchor peak, pairs it with the next 15 peaks within a 2-second window. Each pair `(f1, f2, dt)` is rendered as `"<round(f1)>|<round(f2)>|<dt.toFixed(2)>"` (rounded to keep hashes stable across float drift) and SHA-1 hashed by a small pure-JS `sha1()` implementation. The hash plus the anchor time `t1` becomes one fingerprint.

A 10-second clip typically produces a few hundred to a few thousand fingerprints.

### 4. Lookup (`services/api.ts` → Cloudflare Worker)

`identifySong(fingerprints)` POSTs the array to `https://chordial-api.mike-r-karras.workers.dev/lookup` with a bearer token. The worker compares hashes against its indexed song library and, on a hit, returns:

```json
{ "match": { "title": "...", "artist": "...", "chordChartUrl": "..." } }
```

If nothing matches, the home screen shows a "Song Not Found" alert.

### 5. Chord chart delivery (`app/(tabs)/index.tsx`)

When a match comes back, a modal slides up with the title and artist. Tapping **View Chord Chart (PDF)** calls `FileSystem.downloadAsync()` to save the PDF locally, then hands it to `expo-sharing` so the user can open it in any PDF viewer, AirDrop it, save it to Files, etc.

## Code map

```
app/(tabs)/index.tsx        — Home screen: the big button, pulse animation, result modal
hooks/use-audio-processor.ts — Recording lifecycle and search state machine
services/api.ts             — PCM decoding, fingerprint orchestration, Worker lookup
services/fingerprinting.ts  — FFT, STFT, peak picking, SHA-1, fingerprint generation
components/                 — Themed UI primitives + the chordial-particle-word logo animation
constants/sjuc_songs.json   — Source song list used to seed the lookup index
```

## Running the app

```bash
npm install
npx expo start
```

From the Expo dev server you can launch on iOS Simulator, Android Emulator, a physical device via Expo Go, or the web build. The recognizer needs a real microphone, so the simulators are mostly useful for UI work — test recognition on a device.

### Web deploy

```bash
npm run build-web   # exports static files to dist/
npm run deploy      # publishes dist/ to gh-pages
```

## Permissions

Chordial only asks for one thing: microphone access.

- **iOS** — `NSMicrophoneUsageDescription` in `app.json`.
- **Android** — `RECORD_AUDIO` plus the `MODIFY_AUDIO_SETTINGS` / `FOREGROUND_SERVICE` permissions needed by `expo-audio`.

Recordings stay on-device. Only the fingerprint hashes (opaque 40-character strings) are sent to the lookup service — the raw audio never leaves the phone.
