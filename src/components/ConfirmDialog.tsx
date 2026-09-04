import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Shared destructive-action confirmation: a real Cancel/Confirm step before the
 * server mutation runs, with its own pending/error handling so a failed delete
 * never silently disappears the row it was about to remove.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, title, description, confirmLabel, onCancel, onConfirm }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      // On success the caller closes the dialog by flipping isOpen; nothing left to reset here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thực hiện. Hãy thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (busy) return;
    setError('');
    onCancel();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleCancel}
      closeDisabled={busy}
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-description"
      overlayClassName="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      panelClassName="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-danger-100 text-danger-600 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 id="confirm-dialog-title" className="font-black text-slate-900 text-base">{title}</h3>
          <p id="confirm-dialog-description" className="text-sm text-slate-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          aria-label="Đóng"
          className="w-11 h-11 -m-1.5 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && <p role="alert" className="text-xs font-semibold text-danger-700 bg-danger-50 rounded-xl p-2.5">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          data-autofocus
          className="flex-1 min-h-11 py-2.5 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={busy}
          className="flex-1 min-h-11 py-2.5 rounded-2xl bg-danger-600 hover:bg-danger-700 text-white font-bold text-sm disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
        >
          {busy ? 'Đang xóa...' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
};
