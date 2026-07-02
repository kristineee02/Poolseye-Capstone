// PoolsEye — Duty profile hero card (Alerts screen)

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { lifeguard } from '../data';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';
import { Avatar } from './Primitives';

const RING_SIZE = 76;
const STROKE = 5;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function parseTimeToMinutes(timeStr) {
  const [clock, period] = timeStr.split(' ');
  let [hours, minutes] = clock.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function useShiftProgress(shiftStart, shiftEnd) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const startMin = parseTimeToMinutes(shiftStart);
  const endMin = parseTimeToMinutes(shiftEnd);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const total = Math.max(endMin - startMin, 1);
  const elapsed = Math.max(0, Math.min(total, nowMin - startMin));
  const percent = Math.round((elapsed / total) * 100);

  return { percent };
}

function ShiftRing({ percent, initials }) {
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
  const center = RING_SIZE / 2;

  return (
    <View style={styles.ringOuter}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={center}
          cy={center}
          r={RADIUS}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={RADIUS}
          stroke="#FFFFFF"
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Avatar
          initials={initials}
          size={54}
          color={colors.accentStrong}
          bg={colors.accentTint}
        />
      </View>
    </View>
  );
}

export default function DutyProfileCard() {
  const { percent } = useShiftProgress(lifeguard.shiftStart, lifeguard.shiftEnd);

  return (
    <LinearGradient
      colors={[colors.accentDeep, colors.accentStrong, colors.accent]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.card}
    >
      <ShiftRing percent={percent} initials={lifeguard.initials} />

      <View style={styles.info}>
        <Text style={styles.name}>{lifeguard.name}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.metaDot, { backgroundColor: colors.safe }]} />
          <Text style={styles.metaText}>{lifeguard.role}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>⏱</Text>
          <Text style={styles.metaText}>
            Shift ends {lifeguard.shiftEnd} · started {lifeguard.shiftStart}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    paddingVertical: 18,
    paddingHorizontal: 18,
    ...shadow.md,
  },
  ringOuter: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  name: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  metaIcon: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    width: 14,
    textAlign: 'center',
  },
  metaText: {
    flex: 1,
    fontSize: typography.sm,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
    lineHeight: 17,
  },
});
