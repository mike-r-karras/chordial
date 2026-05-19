import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, ActivityIndicator, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  interpolate 
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAudioProcessor } from '@/hooks/use-audio-processor';
import { BlackHoleBackground } from '@/components/black-hole-background';

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

    try {
      const fileUri = `${FileSystem.documentDirectory}${match.title.replace(/\s+/g, '_')}_chords.pdf`;
      
      // Since the API is a stub, we'll download a dummy PDF
      const { uri } = await FileSystem.downloadAsync(
        match.chordChartUrl,
        fileUri
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Failed to open chords', error);
      Alert.alert('Error', 'Could not open chord chart');
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
        <ThemedText type="title">CHORDIAL</ThemedText>
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
});
