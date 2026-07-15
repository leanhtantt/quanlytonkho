import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';
import Button from './Button';

let openModalCount = 0;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  initialFocusRef,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus initial element only when modal opens
  useEffect(() => {
    if (!open) return;
    const focusInitialElement = () => {
      const el = initialFocusRef?.current || dialogRef.current?.querySelector(focusableSelector) || dialogRef.current;
      el?.focus();
    };
    const timer = window.setTimeout(focusInitialElement, 0);
    return () => window.clearTimeout(timer);
  }, [open, initialFocusRef]);

  // Body lock, keyboard trap, restore focus
  useEffect(() => {
    if (!open) return undefined;

    const previousActiveElement = document.activeElement;
    openModalCount += 1;
    document.body.classList.add('ui-modal-open');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(dialogRef.current?.querySelectorAll(focusableSelector) || []);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      openModalCount -= 1;
      if (openModalCount === 0) document.body.classList.remove('ui-modal-open');
      previousActiveElement?.focus?.();
    };
  }, [closeOnEscape, open]);

  if (!open || typeof document === 'undefined') return null;

  const handleBackdropMouseDown = (event) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) onClose?.();
  };

  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <section
        ref={dialogRef}
        className={`ui-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <header className="ui-modal__header">
          {title ? <h2 id={titleId} className="h3">{title}</h2> : <span />}
          <Button
            variant="ghost"
            size="sm"
            icon={IconX}
            iconOnly
            aria-label="Đóng hộp thoại"
            onClick={onClose}
          />
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
