// PoolsEye — themed confirm / info modal (matches web ConfirmModal)

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';

function ActionButton({ label, tone = 'secondary', onPress }) {
  const isPrimary = tone === 'primary';
  const isDanger = tone === 'danger';

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        isPrimary && styles.btnPrimary,
        isDanger && styles.btnDanger,
        !isPrimary && !isDanger && styles.btnSecondary,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.btnText,
          isPrimary && styles.btnTextOnAccent,
          isDanger && styles.btnTextOnAccent,
          !isPrimary && !isDanger && styles.btnTextSecondary,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {React.ReactNode} [props.children]
 * @param {Array<{ label: string, tone?: 'primary'|'danger'|'secondary', onPress: () => void }>} [props.actions]
 * @param {string} [props.confirmText]
 * @param {string} [props.cancelText]
 * @param {() => void} [props.onConfirm]
 * @param {boolean} [props.isDangerous]
 */
export default function ConfirmModal({
  visible,
  onClose,
  title,
  message,
  children,
  actions,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  isDangerous = false,
}) {
  const resolvedActions =
    actions ||
    (onConfirm
      ? [
          { label: cancelText, tone: 'secondary', onPress: onClose },
          {
            label: confirmText,
            tone: isDangerous ? 'danger' : 'primary',
            onPress: () => {
              onConfirm();
              onClose();
            },
          },
        ]
      : [{ label: 'OK', tone: 'primary', onPress: onClose }]);

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
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>

          <View style={styles.body}>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {children}
          </View>

          <View style={styles.actions}>
            {resolvedActions.map((action) => (
              <ActionButton
                key={action.label}
                label={action.label}
                tone={action.tone}
                onPress={action.onPress}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 111, 255, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    ...shadow.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    flex: 1,
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  message: {
    fontSize: typography.md,
    lineHeight: 21,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 10,
  },
  btn: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnDanger: {
    backgroundColor: colors.alarm,
  },
  btnText: {
    fontSize: typography.base,
    fontWeight: '700',
  },
  btnTextSecondary: {
    color: colors.textPrimary,
  },
  btnTextOnAccent: {
    color: '#FFFFFF',
  },
});
