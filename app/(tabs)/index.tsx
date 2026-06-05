import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

import { BlackHoleBackground } from '@/components/black-hole-background';
import { ChordialParticleWord } from '@/components/chordial-particle-word';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAudioProcessor } from '@/hooks/use-audio-processor';
import sjucSongs from '@/sjuc_songs.json';

// The JSON file is a flat map: song title -> SJUC chord-chart PDF URL.
// Cast once so TypeScript knows what we're working with.
const songs = sjucSongs as Record<string, string>;

// Look up a song title in the SJUC library. Tries an exact match first,
// then falls back to a case- and whitespace-insensitive match in case the
// backend returns a title with slightly different formatting.
function getChordChartUrl(title: string): string | null {
  if (songs[title]) return songs[title];

  const normalized = title.trim().toLowerCase();
  const hit = Object.keys(songs).find(
    (key) => key.trim().toLowerCase() === normalized,
  );
  return hit ? songs[hit] : null;
}

export default function HomeScreen() {
  const { 
    isRecording, 
    isSearching,
    metering, 
    match, 
    startSearchRecording, 
    resetSearch,
    permissionStatus 
  } = useAudioProcessor();
  
  const scale = useSharedValue(1);

  // Holds the PDF URL for the in-app viewer modal. Null = viewer closed.
  // We only ever set this on web; on native we open expo-web-browser instead.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    // Pulse only when not actively searching/capturing and NO result is shown
    if (isRecording || isSearching || !!match) {
      scale.value = withSpring(1.1, { damping: 2, stiffness: 80 });
      return;
    }

    // Map metering (typically -160 to 0) to a scale factor (1 to 1.4)
    const normalizedMetering = Math.max(-60, metering);
    const newScale = interpolate(
      normalizedMetering,
      [-60, 0],
      [1, 1.4]
    );
    scale.value = withSpring(newScale, { damping: 10, stiffness: 100 });
  }, [metering, scale, isRecording, isSearching, match]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleStartSearch = async () => {
    const found = await startSearchRecording();
    if (found === false && !match) {
      Alert.alert(
        "Song Not Found",
        "I'm sorry, we didn't find that song in our library.",
        [{ text: "OK", onPress: resetSearch }]
      );
    }
  };

  const handleOpenChords = async () => {
    if (!match) return;

    // Prefer the URL provided by the API, fall back to local lookup
    const url = match.chordChartUrl || getChordChartUrl(match.title);

    if (!url) {
      Alert.alert(
        'Chord chart not available',
        `We couldn't find a chord chart for "${match.title}" in the SJUC library.`,
      );
      return;
    }

    if (Platform.OS === 'web') {
      // On web, set state so our <iframe> modal opens and embeds the PDF.
      setPdfUrl("https://chordial-fingerprint-api-616025745588.us-west1.run.app/pdf-proxy?url=" + encodeURIComponent(url));
    } else {
      // On iOS / Android, open the URL in the in-app system browser.
      await WebBrowser.openBrowserAsync("https://chordial-fingerprint-api-616025745588.us-west1.run.app/pdf-proxy?url=" + encodeURIComponent(url));
    }
  };

  if (permissionStatus === 'denied') {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Microphone permission is required to use Chordial.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <BlackHoleBackground active={isRecording} />
      <View style={styles.header}>
        <ChordialParticleWord />
      </View>

      <View style={styles.centerContainer}>
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={handleStartSearch}
          disabled={isRecording || isSearching || !!match}
          style={styles.buttonWrapper}
        >
          <Animated.View style={[styles.pulseCircle, animatedStyle]}>
            <View style={styles.innerCircle}>
              <Image
                source={require('@/assets/images/chordial_logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          {isRecording ? (
            <>
              <ActivityIndicator size="large" color="#007AFF" />
              <ThemedText style={styles.statusText}>Capturing audio...</ThemedText>
            </>
          ) : isSearching ? (
            <>
              <ActivityIndicator size="large" color="#FF9500" />
              <ThemedText style={styles.statusText}>Identifying song...</ThemedText>
            </>
          ) : (
            <ThemedText style={styles.instructionText}>
              Click to find chord charts for this song.
            </ThemedText>
          )}
        </View>
      </View>

      <Modal
        visible={!!match}
        transparent={true}
        animationType="slide"
        onRequestClose={resetSearch}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resultContainer}>
            <TouchableOpacity style={styles.closeButton} onPress={resetSearch}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            <ThemedText type="title" style={styles.foundTitle}>
              Found: {match?.title}
            </ThemedText>
            <ThemedText style={styles.artistText}>by {match?.artist}</ThemedText>
            
            <TouchableOpacity style={styles.chordButton} onPress={handleOpenChords}>
              <ThemedText style={styles.chordButtonText}>View Chord Chart (PDF)</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/*
        PDF viewer modal. Only rendered on web.
        React Native Web lets us drop a raw <iframe> into the tree, which the
        browser renders as a normal HTML iframe pointing at the PDF URL.
        On iOS/Android this entire block is skipped because pdfUrl is never set.
      */}
      {Platform.OS === 'web' && (
        <Modal
          visible={!!pdfUrl}
          animationType="slide"
          onRequestClose={() => setPdfUrl(null)}
        >
          <View style={styles.pdfModalContainer}>
            <View style={styles.pdfHeader}>
              <ThemedText style={styles.pdfHeaderTitle} numberOfLines={1}>
                {match?.title ?? 'Chord chart'}
              </ThemedText>
              <TouchableOpacity
                style={styles.pdfCloseButton}
                onPress={() => setPdfUrl(null)}
                accessibilityLabel="Close chord chart"
              >
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.pdfFrameWrapper}>
              {/* @ts-expect-error iframe is a DOM element; this block only runs on web */}
              <iframe
                src={pdfUrl ?? ''}
                title="Chord chart"
                style={{ border: 'none', width: '100%', height: '100%' }}
              />
            </View>
          </View>
        </Modal>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  buttonWrapper: {
    width: 240,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#fff',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: '80%',
    height: '80%',
  },
  infoContainer: {
    marginTop: 40,
    alignItems: 'center',
    height: 80,
  },
  statusText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
  },
  instructionText: {
    fontSize: 18,
    textAlign: 'center',
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  resultContainer: {
    width: '100%',
    padding: 30,
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    top: 20,
    padding: 5,
  },
  foundTitle: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
  },
  artistText: {
    fontSize: 20,
    color: '#333',
    marginTop: 5,
    marginBottom: 30,
    fontWeight: '500',
  },
  chordButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  chordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pdfModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  pdfHeaderTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginRight: 12,
  },
  pdfCloseButton: {
    padding: 4,
  },
  pdfFrameWrapper: {
    flex: 1,
    backgroundColor: '#f4f4f4',
  },
});
