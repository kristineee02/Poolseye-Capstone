import React from 'react';
import AlertDialog from './AlertDialog';

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
 * @param {'success'|'error'|'warning'|'danger'|'info'} [props.tone]
 * @param {string} [props.icon]
 */
export default function ConfirmModal({
  visible,
  onClose,
  title,
  message,
  badge,
  subtitle,
  meta,
  description,
  children,
  actions,
  stackedActions,
  actionColor,
  actionTint,
  actionTextColor,
  actionSecondaryTextColor,
  accentColor,
  accentTint,
  presentation,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  isDangerous = false,
  tone,
  icon,
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
      : undefined);

  return (
    <AlertDialog
      visible={visible}
      onClose={onClose}
      tone={tone || (isDangerous ? 'danger' : 'warning')}
      icon={icon}
      title={title}
      message={message}
      badge={badge}
      subtitle={subtitle}
      meta={meta}
      description={description}
      actions={resolvedActions}
      stackedActions={stackedActions}
      actionColor={actionColor}
      actionTint={actionTint}
      actionTextColor={actionTextColor}
      actionSecondaryTextColor={actionSecondaryTextColor}
      accentColor={accentColor}
      accentTint={accentTint}
      presentation={presentation}
    >
      {children}
    </AlertDialog>
  );
}
