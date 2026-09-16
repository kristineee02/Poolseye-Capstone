import React from 'react';
import ConfirmModal from './ConfirmModal';

export default function StatusModal({ visible, onClose, title, message, tone = 'success' }) {
  return (
    <ConfirmModal
      visible={visible}
      onClose={onClose}
      title={title}
      message={message}
      actions={[
        {
          label: 'OK',
          tone: tone === 'error' ? 'danger' : 'primary',
          onPress: onClose,
        },
      ]}
    />
  );
}
