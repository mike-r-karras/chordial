import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const TEXT = 'chordial';
const COLOR = '#378ADD';
const DOT_SIZE = 5;
const DOT_GAP = 3;
const LETTER_GAP = 2;
const ROW_COUNT = 7;
const ANIMATION_DURATION = 2800;
const MAX_DELAY = 900;

const GLYPHS: Record<string, string[]> = {
  c: [
    '01110',
    '10001',
    '10000',
    '10000',
    '10000',
    '10001',
    '01110',
  ],
  h: [
    '10000',
    '10000',
    '10110',
    '11001',
    '10001',
    '10001',
    '10001',
  ],
  o: [
    '01110',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01110',
  ],
  r: [
    '10110',
    '11001',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
  ],
  d: [
    '00001',
    '00001',
    '01101',
    '10011',
    '10001',
    '10011',
    '01101',
  ],
  i: [
    '1',
    '0',
    '1',
    '1',
    '1',
    '1',
    '1',
  ],
  a: [
    '00000',
    '00000',
    '01110',
    '00001',
    '01111',
    '10001',
    '01111',
  ],
  l: [
    '1',
    '1',
    '1',
    '1',
    '1',
    '1',
    '1',
  ],
};

type ParticlePoint = {
  x: number;
  y: number;
  delay: number;
};

type ParticleDotProps = {
  point: ParticlePoint;
  originX: number;
  originY: number;
  color: string;
};

type ChordialParticleWordProps = {
  color?: string;
  style?: ViewStyle;
};

function buildPoints() {
  let cursorX = 0;
  const rawPoints: Array<{ x: number; y: number }> = [];

  for (const letter of TEXT) {
    const glyph = GLYPHS[letter];
    const glyphWidth = glyph[0].length;

    glyph.forEach((row, rowIndex) => {
      row.split('').forEach((pixel, columnIndex) => {
        if (pixel === '1') {
          rawPoints.push({
            x: cursorX + columnIndex * (DOT_SIZE + DOT_GAP),
            y: rowIndex * (DOT_SIZE + DOT_GAP),
          });
        }
      });
    });

    cursorX += glyphWidth * (DOT_SIZE + DOT_GAP) + LETTER_GAP * (DOT_SIZE + DOT_GAP);
  }

  const wordWidth = cursorX - LETTER_GAP * (DOT_SIZE + DOT_GAP) - DOT_GAP;
  const wordHeight = ROW_COUNT * (DOT_SIZE + DOT_GAP) - DOT_GAP;

  return {
    points: rawPoints.map((point) => ({
      x: point.x - wordWidth / 2,
      y: point.y - wordHeight / 2,
      delay: ((point.y + wordHeight / 2) / wordHeight) * MAX_DELAY,
    })),
    width: wordWidth,
    height: wordHeight,
  };
}

const ParticleDot = memo(function ParticleDot({
  point,
  originX,
  originY,
  color,
}: ParticleDotProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      point.delay,
      withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.out(Easing.elastic(1)),
      })
    );
  }, [point.delay, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const x = interpolate(progress.value, [0, 1], [originX, originX + point.x]);
    const y = interpolate(progress.value, [0, 1], [originY, originY + point.y]);
    const opacity = interpolate(progress.value, [0, 0.12, 1], [0, 1, 1]);

    return {
      opacity,
      transform: [
        { translateX: x - DOT_SIZE / 2 },
        { translateY: y - DOT_SIZE / 2 },
        { scale: interpolate(progress.value, [0, 0.75, 1], [0.4, 1.25, 1]) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  );
});

export function ChordialParticleWord({
  color = COLOR,
  style,
}: ChordialParticleWordProps) {
  const { points, width, height } = useMemo(buildPoints, []);
  const originX = width / 2;
  const originY = height / 2;

  return (
    <View
      accessibilityLabel="chordial"
      accessible
      pointerEvents="none"
      style={[styles.container, { width, height }, style]}
    >
      {points.map((point, index) => (
        <ParticleDot
          key={`${point.x}-${point.y}-${index}`}
          color={color}
          originX={originX}
          originY={originY}
          point={point}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
