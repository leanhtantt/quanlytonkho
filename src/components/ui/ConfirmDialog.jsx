import { useRef } from 'react';
import Button from './Button';
import Modal from './Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Xác nhận thao tác',
  description,
  itemName,
  action = 'Xóa',
  confirmLabel = 'Xóa',
  cancelLabel = 'Hủy',
  loading = false,
}) {
  const cancelButtonRef = useRef(null);
  const defaultDescription = itemName
    ? `Bạn có chắc chắn muốn ${action.toLowerCase()} “${itemName}”?`
    : `Bạn có chắc chắn muốn ${action.toLowerCase()} mục này?`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      initialFocusRef={cancelButtonRef}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
      footer={(
        <>
          <Button ref={cancelButtonRef} variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <p className="ui-confirm-dialog__description">{description || defaultDescription}</p>
    </Modal>
  );
}
