import React from 'react';
import { FoodItem } from '../types';
import { Utensils, Tag, Clock, Trash2 } from 'lucide-react';

interface FoodCardProps {
  food: FoodItem;
  onConsume: (id: string) => void;
  onDelete: (id: string) => void;
}

export const FoodCard: React.FC<FoodCardProps> = ({ food, onConsume, onDelete }) => {
  const getStatusBadge = () => {
    if (food.status === 'EXPIRED' || food.days_remaining <= 0) {
      return {
        bg: 'bg-danger-500/10 border-danger-400/50 text-danger-700 glow-danger',
        dot: 'bg-danger-500 animate-ping',
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

  return (
    <div className="glass-card rounded-2xl p-3.5 transition-all duration-200 hover:shadow-md flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-3">
          {food.photo_url ? (
            <img
              src={food.photo_url}
              alt={food.name}
              className="w-13 h-13 rounded-2xl object-cover ring-1 ring-slate-200 shadow-xs shrink-0"
            />
          ) : (
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/80 border border-white flex items-center justify-center text-2xl shadow-xs shrink-0">
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

      <div className="flex items-center justify-between pt-2 border-t border-slate-100/80 text-xs">
        <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-300" />
          <span>{food.created_by || 'Bạn cùng phòng'}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onDelete(food.id)}
            className="p-1.5 text-slate-400 hover:text-danger-600 hover:bg-danger-50/80 rounded-xl transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onConsume(food.id)}
            className="px-3 py-1.5 bg-gradient-to-r from-fresh-600 to-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs hover:shadow-md transition-all active:scale-95"
          >
            <Utensils className="w-3 h-3" />
            <span>Đã nấu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
