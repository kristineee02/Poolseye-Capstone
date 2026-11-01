import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Text } from './Typography';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

const TONE_COLORS = {
  safe: { tone: '#1B9C6E', tint: 'rgba(27, 156, 110, 0.13)' },
  alarm: { tone: '#D6364A', tint: 'rgba(214, 54, 74, 0.13)' },
  warn: { tone: '#F08C00', tint: 'rgba(240, 140, 0, 0.13)' },
  accent: { tone: '#1E6FFF', tint: 'rgba(30, 111, 255, 0.13)' },
};

const ALERT_TONES = {
  success: { icon: 'checkCircle', color: 'safe' },
  error: { icon: 'alertCircle', color: 'alarm' },
  warning: { icon: 'alertCircle', color: 'warn' },
  danger: { icon: 'trash', color: 'alarm' },
  info: { icon: 'info', color: 'accent' },
  processing: { icon: null, color: 'accent' },
};

const ICONS = {
  checkCircle: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  alertCircle: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="8" x2="12" y2="12" />
      <Line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="16" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12.01" y2="8" />
    </>
  ),
  trash: (
    <>
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  logOut: (
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  bell: (
    <>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
};

function DialogIcon({ name, color, size = 32, strokeWidth = 1.8 }) {
  const shape = ICONS[name];
  if (!shape) return null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {'success'|'error'|'warning'|'danger'|'info'|'processing'} [props.tone]
 * @param {'checkCircle'|'alertCircle'|'info'|'trash'|'logOut'|'bell'} [props.icon]
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {React.ReactNode} [props.children]
 * @param {() => void} [props.onClose]
 * @param {Array<{ label: string, tone?: 'primary'|'danger'|'secondary', onPress: () => void }>} [props.actions]
 */
export default function AlertDialog({
  visible,
  tone = 'info',
  icon,
  title,
  message,
  badge,
  subtitle,
  meta,
  description,
  children,
  onClose,
  actions,
  stackedActions = false,
  actionColor,
  actionTint,
  actionTextColor = '#FFFFFF',
  actionSecondaryTextColor,
}) {
  const config = ALERT_TONES[tone] || ALERT_TONES.info;
  const palette = TONE_COLORS[config.color];
  const iconName = icon || config.icon;
  const isProcessing = tone === 'processing';
  const dismiss = isProcessing ? undefined : onClose;
  const resolvedActions = isProcessing
    ? []
    : actions || [{ label: 'OK', tone: 'primary', onPress: onClose }];

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="fade"
      onRequestClose={() => dismiss?.()}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View
          style={[styles.card, isProcessing && styles.cardProcessing]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          {!isProcessing && onClose ? (
            <TouchableOpacity
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              activeOpacity={0.7}
            >
              <CloseIcon />
            </TouchableOpacity>
          ) : null}

          {isProcessing ? (
            <ActivityIndicator size="large" color={palette.tone} style={styles.spinner} />
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: palette.tint }]}>
              <DialogIcon name={iconName} color={palette.tone} />
            </View>
          )}

          {badge ? (
            <View style={[styles.badge, { backgroundColor: palette.tone }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {description ? (
            <View style={[styles.description, { backgroundColor: palette.tint }]}>
              <View style={[styles.descriptionDot, { backgroundColor: palette.tone }]}>
                <Text style={styles.descriptionDotText}>i</Text>
              </View>
              <Text style={[styles.descriptionText, { color: palette.tone }]}>{description}</Text>
            </View>
          ) : null}
          {message ? (
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent} bounces={false}>
              <Text style={styles.message}>{message}</Text>
            </ScrollView>
          ) : null}
          {children}

          {resolvedActions.length ? (
            <View style={[styles.actions, stackedActions && styles.actionsStacked]}>
              {resolvedActions.map((action) => {
                const variant = action.tone || 'primary';
                return (
                  <TouchableOpacity
                    key={action.label}
                    style={[
                      styles.btn,
                      stackedActions && styles.btnStacked,
                      variant === 'alert' && styles.btnAlert,
                      variant === 'alert' && {
                        backgroundColor: actionColor || palette.tone,
                        shadowColor: actionColor || palette.tone,
                      },
                      variant === 'primary' && styles.btnPrimary,
                      variant === 'danger' && styles.btnDanger,
                      variant === 'secondary' && styles.btnSecondary,
                      variant === 'secondary' && actionTint && {
                        backgroundColor: actionTint,
                        borderColor: actionColor || palette.tone,
                      },
                    ]}
                    onPress={action.onPress}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.btnText,
                        variant === 'secondary' ? styles.btnTextSecondary : styles.btnTextOnTone,
                        variant === 'alert' && { color: actionTextColor },
                        variant === 'secondary' && actionColor && { color: actionSecondaryTextColor || actionColor },
                      ]}
                      numberOfLines={1}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingTop: 30,
    paddingHorizontal: 24,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 25,
    elevation: 12,
  },
  cardProcessing: {
    paddingTop: 34,
    paddingBottom: 30,
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F3F6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  spinner: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#4B5563',
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  descriptionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionDotText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  descriptionText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  messageScroll: {
    flexGrow: 0,
    alignSelf: 'stretch',
  },
  messageContent: {
    alignItems: 'center',
  },
  message: {
    maxWidth: 280,
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  actionsStacked: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  btnStacked: {
    flex: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  btnPrimary: {
    backgroundColor: '#1E6FFF',
    shadowColor: '#1E6FFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 3,
  },
  btnAlert: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 7,
    elevation: 3,
  },
  btnDanger: {
    backgroundColor: '#D6364A',
    shadowColor: '#D6364A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 3,
  },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnTextOnTone: {
    color: '#FFFFFF',
  },
  btnTextSecondary: {
    color: '#374151',
  },
});
