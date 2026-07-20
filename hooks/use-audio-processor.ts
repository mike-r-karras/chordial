import { identifySongFromAudio, SongMatch } from '@/services/api';
import {
  useAudioRecorder,
  AudioModule,
  RecordingOptions,
  IOSOutputFormat,
  AudioQuality,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

const WEB_MIME =
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
    ? 'audio/mp4'
    : 'audio/webm;codecs=opus';

export function useAudioProcessor() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [match, setMatch] = useState<SongMatch | null>(null);
  const isTransitioningRef = useRef(false);

  const AAC_RECORDING_OPTIONS: RecordingOptions = {
    isMeteringEnabled: true,
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 96000,
    android: {
      extension: '.m4a',
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
      audioSource: 'unprocessed',
      sampleRate: 44100,
    },
    ios: {
      outputFormat: IOSOutputFormat.MPEG4AAC,
      audioQuality: AudioQuality.MEDIUM,
      sampleRate: 44100,
    },
    web: {
      mimeType: WEB_MIME,
      bitsPerSecond: 96000,
    },
  };

  const recorder = useAudioRecorder(AAC_RECORDING_OPTIONS);
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
        // Record for 4 seconds (3-5 seconds is ideal for detection and stays under 500KB)
        setTimeout(async () => {
          try {
            console.log('[Processor] Capturing audio for analysis...');
            
            const status = recorder.getStatus();
            console.log(`[Processor] Final recording status: duration=${status.durationMillis}ms, metering=${status.metering}`);
            
            await recorder.stop();
            const uri = recorder.uri;
            
            if (uri) {
              setIsSearching(true);
              const result = await identifySongFromAudio(uri);

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
        }, 4000);
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
