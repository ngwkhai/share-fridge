import React, { useState } from 'react';
import { CreateFoodDto, CompartmentType } from '../types';
import { CameraCapture } from './CameraCapture';
import { X, Check } from 'lucide-react';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (dto: CreateFoodDto) => Promise<void>;
  roomCode: string;
  nickname?: string;
  initialData?: Partial<CreateFoodDto>;
}

const commonSuggestions = ['Thịt ba chỉ', 'Trứng gà', 'Rau muống', 'Thịt bò', 'Sữa chua', 'Đậu phụ', 'Cà chua', 'Xúc xích'];
const containerPresets = ['Hộp Lock xanh', 'Túi zip trắng', 'Túi nilon đỏ', 'Hộp thủy tinh'];

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  roomCode,
  nickname = 'Bạn cùng phòng',
  initialData
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [quantity, setQuantity] = useState(initialData?.quantity || '');
  const [compartment, setCompartment] = useState<CompartmentType>(initialData?.compartment || 'FRIDGE_TOP');
  const [containerTag, setContainerTag] = useState(initialData?.container_tag || '');
  const [shelfDays, setShelfDays] = useState(initialData?.shelf_life_days || 3);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialData?.photo_url || null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (initialData) {
      if (initialData.name) setName(initialData.name);
      if (initialData.quantity) setQuantity(initialData.quantity);
      if (initialData.compartment) setCompartment(initialData.compartment);
      if (initialData.container_tag) setContainerTag(initialData.container_tag);
      if (initialData.shelf_life_days) setShelfDays(initialData.shelf_life_days);
    }
  }, [initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onAdd({
        room_code: roomCode,
        name: name.trim(),
        quantity: quantity.trim() || undefined,
        compartment,
        container_tag: containerTag.trim() || undefined,
        shelf_life_days: shelfDays,
        photo_url: photoUrl,
        created_by: nickname
      });
      onClose();
      setName('');
      setQuantity('');
      setContainerTag('');
      setPhotoUrl(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-black text-slate-900 text-base tracking-tight">Thêm Món Mới</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tên món */}
          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="Tên thực phẩm (VD: Thịt ba chỉ...)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
              autoFocus
              required
            />
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {commonSuggestions.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setName(item)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium whitespace-nowrap transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Vị trí ngăn tủ */}
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold">
              {[
                { id: 'FREEZER', label: '❄️ Ngăn đông' },
                { id: 'FRIDGE_TOP', label: '🥩 Mát trên' },
                { id: 'FRIDGE_BOTTOM', label: '🍲 Mát dưới' },
                { id: 'CRISPER', label: '🥬 Hộc rau' },
                { id: 'DOOR', label: '🥚 Cánh tủ' }
              ].map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setCompartment(c.id as CompartmentType);
                    if (c.id === 'FREEZER' && shelfDays < 10) setShelfDays(14);
                  }}
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

          {/* Hạn dùng Preset */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Hạn bảo quản</span>
              <span className="font-black text-fresh-600 font-mono text-sm">{shelfDays} ngày</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { days: 1, label: '1 ngày' },
                { days: 3, label: '3 ngày' },
                { days: 7, label: '7 ngày' },
                { days: 14, label: '14 ngày' }
              ].map((preset) => (
                <button
                  type="button"
                  key={preset.days}
                  onClick={() => setShelfDays(preset.days)}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    shelfDays === preset.days
                      ? 'bg-gradient-to-r from-fresh-600 to-emerald-500 text-white border-transparent shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nhãn nhận diện & Camera */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {containerPresets.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => setContainerTag(tag)}
                  className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-xl text-xs font-medium whitespace-nowrap"
                >
                  {tag}
                </button>
              ))}
            </div>

            <CameraCapture photoUrl={photoUrl} onPhotoCaptured={setPhotoUrl} />
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-98"
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? 'Đang lưu...' : 'Lưu vào tủ'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
