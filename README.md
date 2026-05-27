# Chordial

Chordial is a one-button song recognizer for ukulele players. Point your phone at a speaker (or just at whatever's playing in the room), tap the logo, and ten seconds later it tells you the song and hands you a ukulele chord chart as a shareable PDF.

It's a [Shazam-style](https://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf) acoustic-fingerprinting client built on [Expo](https://expo.dev) / React Native, with a Cloudflare Worker doing the heavy lifting on the server side.

## How it works

A single tap kicks off a four-stage pipeline. Everything heavy — STFT, peak picking, fingerprint hashing, library lookup — lives behind one endpoint on the worker; the app's only jobs are to capture audio, upload it, and render the result.

### 1. Capture (`hooks/use-audio-processor.ts`)

The home screen calls `startSearchRecording()` which:

- Configures `expo-audio` to record exactly 10 seconds of mono AAC in an M4A container at 44.1 kHz / 96 kbps.
- On web, feature-detects `MediaRecorder` MIME support and falls back from `audio/mp4` to `audio/webm;codecs=opus` (for Firefox).
- Streams `metering` values to the UI so the capture button pulses with the input level (see `interpolate` in `app/(tabs)/index.tsx`).
- After 10 seconds, stops the recorder and passes the URI to `identifySongFromAudio()`.

State flags (`isRecording`, `isSearching`, `match`) are exposed to the screen so the button can show an indicator and disable retaps mid-search.

### 2. Upload and lifecycle (`services/api.ts`)

`identifySongFromAudio(uri)` is the entire client-side API surface. It:

- Builds a `FormData` body containing the recording:
  - **Native (iOS/Android)** — appends a React Native file-reference object pointing at the recorder's file URI.
  - **Web** — does `fetch(blobUri).then(r => r.blob())` to materialize the in-memory `Blob` and appends it.
- POSTs to `https://chordial-api.mike-r-karras.workers.dev/fragments` with a bearer token. `fetch` auto-sets the `multipart/form-data` boundary.
- Parses the response shape `{ match: { title, artist, chordChartUrl } }`, or returns `null` on a miss.
- **In `finally`, regardless of success or failure, destroys the local copy of the recording.** On native that's `FileSystem.deleteAsync(uri, { idempotent: true })`; on web it's `URL.revokeObjectURL(uri)`. The audio is gone from the device the moment the request settles.

### 3. Identification (Cloudflare Worker, separate repo)

The worker is responsible for the actual fingerprint-and-match work — Hann-windowed STFT, constellation peak picking, SHA-1-hashed peak pairs, and a lookup against the indexed song library. The client doesn't know or care how any of that works; it just gets back `{ match }` or nothing. Moving this off-device means consistent fingerprints across iOS / Android / web (no float-drift differences between platforms), a smaller bundle, and one place to iterate on the matching algorithm.

### 4. Chord chart delivery (`app/(tabs)/index.tsx`)

When a match comes back, a modal slides up with the title and artist. Tapping **View Chord Chart (PDF)** calls `FileSystem.downloadAsync()` to save the PDF locally, then hands it to `expo-sharing` so the user can open it in any PDF viewer, AirDrop it, save it to Files, etc.

## Code map

```
app/(tabs)/index.tsx          — Home screen: the big button, pulse animation, result modal
hooks/use-audio-processor.ts  — Recording lifecycle and search state machine
services/api.ts               — identifySongFromAudio() — upload, parse, cleanup
components/                   — Themed UI primitives + the chordial-particle-word logo animation
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

## Data handling

The 10-second audio capture is uploaded once to the `/fragments` endpoint over HTTPS and then deleted from the device — the file URI is removed on native via `FileSystem.deleteAsync`, the blob URL is revoked on web, and no copy is retained in the app's storage. Each recording exists on the device only for as long as the upload is in flight (typically a fraction of a second on a good connection).
