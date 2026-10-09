// PoolsEye — single-button status modal (matches web StatusModal)

import React from 'react';
import AlertDialog from './AlertDialog';

export default function StatusModal({ visible, onClose, title, message, tone = 'success', icon, confirmText = 'OK' }) {
  return (
    <AlertDialog
      visible={visible}
      onClose={onClose}
      tone={tone || 'info'}
      icon={icon}
      title={title}
      message={message}
      actions={[{ label: confirmText, tone: 'primary', onPress: onClose }]}
    />
  );
}
