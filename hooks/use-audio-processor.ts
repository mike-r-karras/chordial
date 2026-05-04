import { useState, useEffect, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { fingerprintAudio, identifySong, SongMatch } from '@/services/api';

export function useAudioProcessor() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [metering, setMetering] = useState(-160); // Default low value in dB
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [match, setMatch] = useState<SongMatch | null>(null);
  
  const ambientRecordingRef = useRef<Audio.Recording | null>(null);
  const isTransitioningRef = useRef(false);

  // Initialize Audio Session
  useEffect(() => {
    async function setupAudio() {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    }
    setupAudio();
  }, []);

  const stopAmbientMonitoring = useCallback(async () => {
    if (ambientRecordingRef.current) {
      try {
        const status = await ambientRecordingRef.current.getStatusAsync();
        if (status.canRecord || status.isRecording) {
          await ambientRecordingRef.current.stopAndUnloadAsync();
        }
      } catch (e) {
        console.log('[Processor] Ambient stop error (likely already stopped):', e);
      } finally {
        ambientRecordingRef.current = null;
      }
    }
  }, []);

  // Ambient Monitoring for Pulsing
  const startAmbientMonitoring = useCallback(async () => {
    if (isTransitioningRef.current || isRecording || isSearching || !!match) return;
    
    const status = await Audio.getPermissionsAsync();
    if (status.status !== 'granted') return;

    // Ensure previous is gone
    await stopAmbientMonitoring();

    try {
      console.log('[Processor] Starting ambient monitoring...');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY,
        (status) => {
          if (status.metering !== undefined) {
            setMetering(status.metering);
          }
        },
        100 // Metering interval in ms
      );
      ambientRecordingRef.current = newRecording;
    } catch (err) {
      console.error('[Processor] Failed to start ambient monitoring', err);
    }
  }, [isRecording, isSearching, match, stopAmbientMonitoring]);

  useEffect(() => {
    async function initPermissions() {
      const { status } = await Audio.getPermissionsAsync();
      if (status !== 'granted') {
        await requestPermission();
      }
    }
    initPermissions();
  }, [requestPermission]);

  useEffect(() => {
    // Only start ambient if we aren't busy and don't have a result
    if (permissionResponse?.status === 'granted' && !isRecording && !isSearching && !match) {
      startAmbientMonitoring();
    }
    return () => {
      stopAmbientMonitoring();
    };
  }, [permissionResponse, isRecording, isSearching, match, startAmbientMonitoring, stopAmbientMonitoring]);

  const startSearchRecording = async () => {
    if (isRecording || isSearching || isTransitioningRef.current) return;

    isTransitioningRef.current = true;
    setIsRecording(true);
    setIsSearching(false);
    setMatch(null);

    try {
      // 1. Stop ambient cleanly
      await stopAmbientMonitoring();

      // 2. Start real recording
      console.log('[Processor] Starting search recording...');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      isTransitioningRef.current = false;

      const fingerprints: string[] = [];

      return new Promise<boolean>((resolve) => {
        // Logic for 5 bites (10s each, offset by 1s)
        for (let i = 0; i < 5; i++) {
          setTimeout(async () => {
            console.log(`[Processor] Capturing bite ${i + 1}...`);
            const fp = await fingerprintAudio(newRecording.getURI() || 'temp_uri');
            fingerprints.push(fp);
            
            if (fingerprints.length === 5) {
              setIsSearching(true);
              setIsRecording(false);
              const result = await identifySong(fingerprints);
              
              // Cleanup recording before resolving
              await stopRealRecording(newRecording);
              
              setMatch(result);
              setIsSearching(false);
              resolve(!!result);
            }
          }, (10 + i) * 1000);
        }

        // Safety timeout
        setTimeout(async () => {
          if (fingerprints.length < 5) {
            await stopRealRecording(newRecording);
            resolve(false);
          }
        }, 16000);
      });

    } catch (err) {
      console.error('[Processor] Failed to start search recording', err);
      setIsRecording(false);
      isTransitioningRef.current = false;
      startAmbientMonitoring();
      return false;
    }
  };

  const stopRealRecording = async (recObj: Audio.Recording | null) => {
    const target = recObj || recording;
    if (!target) return;
    
    try {
      const status = await target.getStatusAsync();
      if (status.canRecord || status.isRecording) {
        await target.stopAndUnloadAsync();
      }
    } catch (err) {
      console.log('[Processor] Real recording stop error:', err);
    } finally {
      if (!recObj || recObj === recording) {
        setRecording(null);
      }
    }
  };

  const resetSearch = useCallback(async () => {
    setMatch(null);
    setIsSearching(false);
    setIsRecording(false);
    // Explicitly trigger ambient restart
    startAmbientMonitoring();
  }, [startAmbientMonitoring]);

  return {
    isRecording,
    isSearching,
    metering,
    match,
    startSearchRecording,
    resetSearch,
    permissionStatus: permissionResponse?.status,
  };
}
