import React, { useEffect, useRef } from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  overlayClassName: string;
  panelClassName: string;
  children: React.ReactNode;
  /** Disables Escape-to-close and backdrop-click-to-close while a mutation is in flight. */
  closeDisabled?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One accessible dialog shell shared by every modal in the app: role="dialog",
 * aria-modal, Escape-to-close, a focus trap that cycles Tab/Shift+Tab inside the
 * panel, focus moved into the panel on open, and focus returned to whatever
 * triggered it on close. Visual styling stays with each caller (overlayClassName /
 * panelClassName) so this never invents a new look — only the accessible behavior.
 */
export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  labelledBy,
  describedBy,
  overlayClassName,
  panelClassName,
  children,
  closeDisabled = false
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const autofocusTarget = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (autofocusTarget || panel)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeDisabledRef.current) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={overlayClassName}
      onMouseDown={event => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1} className={panelClassName}>
        {children}
      </div>
    </div>
  );
};
