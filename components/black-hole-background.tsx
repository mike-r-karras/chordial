import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing,
  interpolate,
  useAnimatedReaction,
  withSpring,
  runOnUI
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const CENTER_X = width / 2;
const CENTER_Y = height / 2;
const BUTTON_RADIUS = 90;
const DOT_COUNT = 30;
const RING_COUNT = 15;

const SOLARIZED_COLORS = [
  '#b58900', '#cb4b16', '#dc322f', '#d33682',
  '#6c71c4', '#268bd2', '#2aa198', '#859900',
];

interface DotProps {
  id: number;
  ringDistortions: Animated.SharedValue<number>[];
  ringAngles: Animated.SharedValue<number>[];
}

const Dot = ({ id, ringDistortions, ringAngles }: DotProps) => {
  const progress = useSharedValue(0);
  const color = useMemo(() => SOLARIZED_COLORS[id % SOLARIZED_COLORS.length], [id]);
  
  const startPos = useMemo(() => {
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: return { x: Math.random() * width, y: -20 };
      case 1: return { x: width + 20, y: Math.random() * height };
      case 2: return { x: Math.random() * width, y: height + 20 };
      default: return { x: -20, y: Math.random() * height };
    }
  }, []);

  const startDist = useMemo(() => {
    return Math.sqrt(Math.pow(startPos.x - CENTER_X, 2) + Math.pow(startPos.y - CENTER_Y, 2));
  }, [startPos]);

  const angle = useMemo(() => {
    return Math.atan2(startPos.y - CENTER_Y, startPos.x - CENTER_X);
  }, [startPos]);

  useEffect(() => {
    const delay = Math.random() * 5000;
    progress.value = 0;
    setTimeout(() => {
      progress.value = withRepeat(
        withTiming(1, { duration: 3000 + Math.random() * 2000, easing: Easing.linear }),
        -1,
        false
      );
    }, delay);
  }, []);

  useAnimatedReaction(
    () => progress.value,
    (current, previous) => {
      if (!previous || current < previous) return;

      for (let i = 0; i < RING_COUNT; i++) {
        const ringR = (i + 1) * (Math.max(width, height) / RING_COUNT);
        const pAtRing = 1 - (ringR / startDist);
        
        if (previous < pAtRing && current >= pAtRing) {
          // Trigger the "ringing" effect on the ring
          ringAngles[i].value = angle;
          ringDistortions[i].value = 1;
          ringDistortions[i].value = withSpring(0, { damping: 2, stiffness: 80 });
        }
      }
    }
  );

  const animatedStyle = useAnimatedStyle(() => {
    const x = interpolate(progress.value, [0, 1], [startPos.x, CENTER_X]);
    const y = interpolate(progress.value, [0, 1], [startPos.y, CENTER_Y]);
    const dist = Math.sqrt(Math.pow(x - CENTER_X, 2) + Math.pow(y - CENTER_Y, 2));
    const opacity = dist < BUTTON_RADIUS ? 0 : 1;

    return {
      position: 'absolute',
      left: x,
      top: y,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: color,
      opacity,
      transform: [{ scale: interpolate(progress.value, [0, 0.8, 1], [1, 1.5, 0]) }],
      zIndex: 2,
    };
  });

  return <Animated.View style={animatedStyle} />;
};

const Ring = ({ index, distortion, angle }: { 
  index: number; 
  distortion: Animated.SharedValue<number>;
  angle: Animated.SharedValue<number>;
}) => {
  const ringRadius = (index + 1) * (Math.max(width, height) / RING_COUNT);
  
  const animatedStyle = useAnimatedStyle(() => {
    const d = distortion.value;
    const a = angle.value;
    
    // Sinusoidal displacement in the direction of the hit
    const tx = Math.cos(a) * d * 15;
    const ty = Math.sin(a) * d * 15;

    return {
      position: 'absolute',
      left: CENTER_X - ringRadius,
      top: CENTER_Y - ringRadius,
      width: ringRadius * 2,
      height: ringRadius * 2,
      borderRadius: ringRadius,
      borderWidth: 1,
      borderColor: 'rgba(0, 122, 255, 0.2)',
      zIndex: 1,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: 1 + d * 0.03 }
      ],
    };
  });

  return <Animated.View style={animatedStyle} pointerEvents="none" />;
};

export const BlackHoleBackground = ({ active }: { active: boolean }) => {
  const ringDistortions = Array.from({ length: RING_COUNT }).map(() => useSharedValue(0));
  const ringAngles = Array.from({ length: RING_COUNT }).map(() => useSharedValue(0));

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <Ring 
          key={`ring-${i}`} 
          index={i} 
          distortion={ringDistortions[i]} 
          angle={ringAngles[i]}
        />
      ))}
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <Dot 
          key={`dot-${i}`} 
          id={i} 
          ringDistortions={ringDistortions} 
          ringAngles={ringAngles}
        />
      ))}
    </View>
  );
};
