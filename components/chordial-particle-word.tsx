import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';

const TEXT = 'CHORDIAL';
const COLOR = '#378ADD';
const W = 700;
const H = 160;
const FONT = 'bold 72px sans-serif';

type ChordialParticleWordProps = {
  color?: string;
  style?: ViewStyle;
};

type Particle = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Elastic-out easing, ported verbatim from the reference HTML.
function elasticOut(t: number): number {
  if (t === 0 || t === 1) return t;
  const p = 0.6;
  const s = p / 4;
  return Math.pow(2, -8 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
}

// Render the word to an offscreen canvas, then sample pixels at a fixed
// step. Every sufficiently-opaque sample becomes a particle that starts
// at the center of the canvas and animates out to its real position.
function buildParticles(): Particle[] {
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  const oc = offscreen.getContext('2d');
  if (!oc) return [];

  oc.clearRect(0, 0, W, H);
  oc.font = FONT;
  oc.fillStyle = '#000';
  oc.textAlign = 'center';
  oc.textBaseline = 'middle';
  oc.fillText(TEXT, W / 2, H / 2);

  const data = oc.getImageData(0, 0, W, H).data;
  const pts: Particle[] = [];
  const step = 3;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const idx = (y * W + x) * 4;
      if (data[idx + 3] > 80) {
        pts.push({ x0: W / 2, y0: H / 2, x1: x, y1: y, delay: y / H });
      }
    }
  }
  return pts;
}

export function ChordialParticleWord({
  color = COLOR,
  style,
}: ChordialParticleWordProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = W;
    canvas.height = H;

    const particles = buildParticles();
    const particleDuration = 3000;
    const maxDelay = 2000;
    const totalDuration = particleDuration + maxDelay + 200;
    const startTime = performance.now();

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const pStart = p.delay * maxDelay;
        const raw = Math.max(0, (elapsed - pStart) / particleDuration);
        const t = Math.min(1, raw);
        const ease = elasticOut(t);
        ctx.fillRect(
          lerp(p.x0, p.x1, ease),
          lerp(p.y0, p.y1, ease),
          2.5,
          2.5,
        );
      }

      if (elapsed < totalDuration) {
        rafRef.current = requestAnimationFrame(render);
      }
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [color]);

  // Native (iOS/Android) fallback: the canvas-based particle effect is
  // a web-only DOM technique. Show the word as bold text so native still
  // renders a reasonable header without adding heavy dependencies.
  if (Platform.OS !== 'web') {
    return (
      <View
        accessibilityLabel="CHORDIAL"
        accessible
        style={[styles.fallbackContainer, style]}
      >
        <Text style={[styles.fallbackText, { color }]}>{TEXT}</Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="CHORDIAL"
      accessible
      pointerEvents="none"
      style={[styles.container, style]}
    >
      {/* @ts-ignore <canvas> is a DOM element; this branch only runs on web */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxWidth: W,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: W,
    maxWidth: '100%',
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  fallbackText: {
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: 4,
  },
});
