import { fingerprintAudio, identifySong, SongMatch } from '@/services/api';
import { 
  useAudioRecorder, 
  RecordingPresets, 
  AudioModule, 
  RecordingOptions,
  IOSOutputFormat,
  AudioQuality,
  useAudioRecorderState
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioProcessor() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [match, setMatch] = useState<SongMatch | null>(null);
  const isTransitioningRef = useRef(false);

  // WAV Recording Options for Fingerprinting
  const WAV_RECORDING_OPTIONS: RecordingOptions = {
    isMeteringEnabled: true,
    extension: '.wav',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 128000,
    android: {
      extension: '.m4a',
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
      audioSource: 'unprocessed',
    },
    ios: {
      outputFormat: IOSOutputFormat.LINEARPCM,
      audioQuality: AudioQuality.HIGH,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/wav',
      bitsPerSecond: 128000,
    },
  };

  const recorder = useAudioRecorder(WAV_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);

  // Initialize Audio Session
  useEffect(() => {
    async function setupAudio() {
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
    }
    setupAudio();
  }, []);

  useEffect(() => {
    async function initPermissions() {
      const status = await AudioModule.getRecordingPermissionsAsync();
      if (status.status !== 'granted') {
        await AudioModule.requestRecordingPermissionsAsync();
      }
    }
    initPermissions();
  }, []);

  const startSearchRecording = async () => {
    if (isRecording || isSearching || isTransitioningRef.current) return;

    isTransitioningRef.current = true;
    setIsRecording(true);
    setIsSearching(false);
    setMatch(null);

    try {
      console.log('[Processor] Starting search recording...');
      
      // prepareToRecordAsync might be needed depending on implementation details, 
      // but useAudioRecorder usually handles it. Explicitly calling just in case.
      await recorder.prepareToRecordAsync();
      recorder.record();
      
      isTransitioningRef.current = false;

      return new Promise<boolean>((resolve) => {
        // Record for 10 seconds to get enough data for a good fingerprint
        setTimeout(async () => {
          try {
            console.log('[Processor] Capturing audio for analysis...');
            
            const status = recorder.getStatus();
            console.log(`[Processor] Final recording status: duration=${status.durationMillis}ms, metering=${status.metering}`);
            
            await recorder.stop();
            const uri = recorder.uri;
            
            if (uri) {
              setIsSearching(true);
              const hashes = await fingerprintAudio(uri);
              const result = await identifySong(hashes);
              
              setMatch(result);
              setIsSearching(false);
              setIsRecording(false);
              resolve(!!result);
            } else {
              console.warn('[Processor] No URI found for recording');
              setIsRecording(false);
              resolve(false);
            }
          } catch (e) {
            console.error('[Processor] Error processing recording:', e);
            setIsRecording(false);
            resolve(false);
          } finally {
            // No explicit cleanup needed for recorder as useAudioRecorder handles it
          }
        }, 10000);
      });

    } catch (err) {
      console.error('[Processor] Failed to start search recording', err);
      setIsRecording(false);
      isTransitioningRef.current = false;
      return false;
    }
  };

  const resetSearch = useCallback(async () => {
    setMatch(null);
    setIsSearching(false);
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    isSearching,
    metering: recorderState.metering ?? -160,
    match,
    startSearchRecording,
    resetSearch,
    permissionStatus: 'granted', // Simplified for now as we check on init
  };
}
