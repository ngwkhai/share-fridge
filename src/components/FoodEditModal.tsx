import React, { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { FoodItem, UpdateFoodDto, CompartmentType } from '../types';
import { Dialog } from './Dialog';

interface FoodEditModalProps {
  isOpen: boolean;
  food: FoodItem | null;
  onClose: () => void;
  onSave: (id: string, dto: UpdateFoodDto) => Promise<void>;
}

const compartments: { id: CompartmentType; label: string }[] = [
  { id: 'FREEZER', label: '❄️ Ngăn đông' },
  { id: 'FRIDGE_TOP', label: '🥩 Mát trên' },
  { id: 'FRIDGE_BOTTOM', label: '🍲 Mát dưới' },
  { id: 'CRISPER', label: '🥬 Hộc rau' },
  { id: 'DOOR', label: '🥚 Cánh tủ' }
];

const toDateInput = (iso: string) => iso.slice(0, 10);
const toIsoMidnightUtc = (dateInput: string) => new Date(`${dateInput}T00:00:00.000Z`).toISOString();

// A multi-field object edit belongs on the Modal rung of the DESIGN.md ladder (rung 4),
// not inline. Failed saves keep the modal open with the user's edits intact (never lose
// in-progress work), matching the pending/error non-destructive-recovery requirement.
export const FoodEditModal: React.FC<FoodEditModalProps> = ({ isOpen, food, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [compartment, setCompartment] = useState<CompartmentType>('FRIDGE_TOP');
  const [containerTag, setContainerTag] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!food) return;
    setName(food.name);
    setQuantity(food.quantity || '');
    setCompartment(food.compartment);
    setContainerTag(food.container_tag || '');
    setExpiryDate(toDateInput(food.expiry_date));
    setError('');
  }, [food?.id, isOpen]);

  if (!isOpen || !food) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(food.id, {
        name: name.trim(),
        quantity: quantity.trim() || undefined,
        compartment,
        container_tag: containerTag.trim() || undefined,
        expiry_date: toIsoMidnightUtc(expiryDate)
      });
      onClose();
    } catch (err) {
      // Non-destructive recovery: keep the modal open with everything the user typed.
      setError(err instanceof Error ? err.message : 'Không thể lưu thay đổi. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={saving}
      labelledBy="food-edit-title"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 id="food-edit-title" className="font-black text-slate-900 text-base tracking-tight">Sửa món: {food.name}</h3>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Đóng sửa món"
          className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
          <span>Tên thực phẩm</span>
          <input
            data-autofocus
            type="text"
            value={name}
            maxLength={200}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
            required
          />
        </label>

        <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
          <span>Số lượng</span>
          <input aria-label="Số lượng" value={quantity} maxLength={200} onChange={e => setQuantity(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" placeholder="Ví dụ: 0.5 kg" />
        </label>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-700">Vị trí</span>
          <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold pt-1.5">
            {compartments.map(c => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCompartment(c.id)}
                aria-pressed={compartment === c.id}
                className={`py-2 px-1 rounded-xl border transition-all ${
                  compartment === c.id
                    ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
          <span>Hạn dùng</span>
          <input
            type="date"
            aria-label="Hạn dùng"
            value={expiryDate}
            onChange={e => setExpiryDate(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm"
            required
          />
        </label>

        <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
          <span>Dấu hiệu nhận biết</span>
          <input aria-label="Dấu hiệu nhận biết" value={containerTag} maxLength={200} onChange={e => setContainerTag(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" placeholder="Ví dụ: Hộp xanh" />
        </label>

        {error && <p role="alert" className="text-xs font-semibold text-danger-700 bg-danger-50 rounded-xl p-2.5">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 min-h-11 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 min-h-11 py-3 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-98"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
          </button>
        </div>
      </form>
    </Dialog>
  );
};
