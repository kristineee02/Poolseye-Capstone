import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';

function StatusFace({ failed }) {
  const color = failed ? '#E11D48' : '#1B9C6E';
  return (
    <Svg width={54} height={54} viewBox="0 0 48 48" fill="none">
      <Rect x="7" y="7" width="34" height="34" rx="10" stroke={color} strokeWidth="2.2" />
      <Path d="M17 20h3.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M27.5 20H31" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      {failed ? (
        <Path d="M18 31c2.2-2.4 9.8-2.4 12 0" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <Path d="M18 28c2.2 2.6 9.8 2.6 12 0" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      )}
    </Svg>
  );
}

export default function StatusModal({ visible, onClose, title, message, tone = 'success' }) {
  const failed = tone === 'error';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={styles.closeMark}>×</Text>
          </TouchableOpacity>

          <View style={[styles.glow, failed ? styles.glowError : styles.glowSuccess]}>
            <StatusFace failed={failed} />
          </View>

          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity style={styles.ok} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 22,
    alignItems: 'center',
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: {
    color: '#E11D48',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: -1,
  },
  glow: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  glowSuccess: {
    backgroundColor: 'rgba(34, 160, 107, 0.16)',
  },
  glowError: {
    backgroundColor: 'rgba(225, 29, 72, 0.14)',
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  ok: {
    alignSelf: 'stretch',
    height: 46,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
});
