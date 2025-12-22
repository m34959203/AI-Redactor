import { useState, useCallback } from 'react';

/**
 * useConfirm - Hook for managing confirm dialogs
 *
 * @returns {Object} Confirm dialog state and methods
 */
const useConfirm = () => {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Удалить',
    cancelText: 'Отмена',
    variant: 'danger',
    onConfirm: () => {},
  });

  const showConfirm = useCallback(({
    title = 'Подтверждение',
    message = 'Вы уверены?',
    confirmText = 'Удалить',
    cancelText = 'Отмена',
    variant = 'danger',
    onConfirm = () => {},
  }) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      variant,
      onConfirm,
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      showConfirm({
        ...options,
        onConfirm: () => {
          resolve(true);
        },
      });

      // Handle cancel by checking when dialog closes without confirm
      const checkClosed = () => {
        setConfirmState(prev => {
          if (!prev.isOpen) {
            resolve(false);
          }
          return prev;
        });
      };

      // Small delay to allow dialog to close
      setTimeout(checkClosed, 100);
    });
  }, [showConfirm]);

  return {
    confirmState,
    showConfirm,
    hideConfirm,
    confirm,
  };
};

export default useConfirm;
