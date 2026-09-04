import React, { useState } from 'react';
import { FoodItem, UpdateFoodDto } from '../types';
import { Utensils, Tag, Clock, Trash2, ImageOff, Pencil, Loader2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { FoodEditModal } from './FoodEditModal';

interface FoodCardProps {
  food: FoodItem;
  onConsume: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, dto: UpdateFoodDto) => Promise<void>;
}

export const FoodCard: React.FC<FoodCardProps> = ({ food, onConsume, onDelete, onEdit }) => {
  const [consuming, setConsuming] = useState(false);
  const [consumeError, setConsumeError] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const busy = consuming || confirmDeleteOpen;

  const getStatusBadge = () => {
    if (food.status === 'EXPIRED' || food.days_remaining <= 0) {
      return {
        bg: 'bg-danger-500/10 border-danger-400/50 text-danger-700 glow-danger',
        dot: 'bg-danger-500 motion-safe:animate-ping',
        text: 'Hết hạn'
      };
    }
    if (food.status === 'COOK_SOON' || food.days_remaining <= 2) {
      return {
        bg: 'bg-amber-500/15 border-amber-400/60 text-amber-800 glow-urgent',
        dot: 'bg-amber-500',
        text: `Nấu gấp (${food.days_remaining}d)`
      };
    }
    return {
      bg: 'bg-fresh-500/10 border-fresh-400/40 text-fresh-700',
      dot: 'bg-fresh-500',
      text: `${food.days_remaining} ngày`
    };
  };

  const getCompartmentLabel = (comp: string) => {
    switch (comp) {
      case 'FREEZER': return '❄️ Ngăn đông';
      case 'FRIDGE_TOP': return '🥩 Mát trên';
      case 'FRIDGE_BOTTOM': return '🍲 Mát dưới';
      case 'CRISPER': return '🥬 Hộc rau';
      case 'DOOR': return '🥚 Cánh tủ';
      default: return comp;
    }
  };

  const badge = getStatusBadge();

  const handleConsume = async () => {
    if (busy) return;
    setConsuming(true);
    setConsumeError('');
    try {
      await onConsume(food.id);
      // On success this card unmounts (the item leaves the active list); nothing left to reset.
    } catch (err) {
      setConsumeError(err instanceof Error ? err.message : 'Không thể cập nhật. Thử lại.');
      setConsuming(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-3.5 transition-all duration-200 hover:shadow-md flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-3">
          {food.photo_url ? (
            <img
              src={food.photo_url}
              alt={food.name}
              className="w-[52px] h-[52px] rounded-2xl object-cover ring-1 ring-slate-200 shadow-xs shrink-0"
            />
          ) : food.storage_path ? (
            <div
              className="w-[52px] h-[52px] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shadow-xs shrink-0"
              title="Ảnh tạm thời không khả dụng"
            >
              <ImageOff className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-[52px] h-[52px] rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/80 border border-white flex items-center justify-center text-2xl shadow-xs shrink-0">
              {food.compartment === 'FREEZER' ? '❄️' : food.compartment === 'CRISPER' ? '🥬' : '🥘'}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900 text-sm tracking-tight">{food.name}</span>
              {food.quantity && (
                <span className="text-xs font-mono font-medium text-slate-500">({food.quantity})</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="px-2 py-0.5 bg-slate-100/90 rounded-lg font-semibold text-slate-700 border border-slate-200/60">
                {getCompartmentLabel(food.compartment)}
              </span>

              {food.container_tag && (
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-900 rounded-lg font-semibold flex items-center gap-1 border border-amber-300/40">
                  <Tag className="w-2.5 h-2.5 text-amber-600" />
                  {food.container_tag}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border flex items-center gap-1.5 ${badge.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
            <span>{badge.text}</span>
          </div>
        </div>
      </div>

      {consumeError && <p role="alert" className="text-xs font-semibold text-danger-700 bg-danger-50 rounded-xl p-2">{consumeError}</p>}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100/80 text-xs">
        <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-300" />
          <span>{food.created_by || 'Bạn cùng phòng'}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditOpen(true)}
            disabled={busy}
            aria-label={`Sửa ${food.name}`}
            className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={busy}
            aria-label={`Xóa ${food.name}`}
            className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-danger-600 hover:bg-danger-50/80 rounded-xl transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => void handleConsume()}
            disabled={busy}
            className="min-h-11 px-3 py-1.5 bg-gradient-to-r from-fresh-600 to-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all active:scale-95 disabled:opacity-60"
          >
            {consuming ? <Loader2 className="w-3 h-3 motion-safe:animate-spin" /> : <Utensils className="w-3 h-3" />}
            <span>{consuming ? 'Đang lưu...' : 'Đã nấu'}</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        title={`Xóa ${food.name}?`}
        description="Món này sẽ bị xóa khỏi tủ lạnh. Không thể hoàn tác."
        confirmLabel="Xóa món"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => { await onDelete(food.id); setConfirmDeleteOpen(false); }}
      />

      <FoodEditModal
        isOpen={editOpen}
        food={food}
        onClose={() => setEditOpen(false)}
        onSave={onEdit}
      />
    </div>
  );
};
