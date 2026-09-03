import React from 'react';
import { AlertCircle, Snowflake, ShoppingBag, Layers } from 'lucide-react';
import { FoodItem } from '../types';

interface PulseStripProps {
  foods: FoodItem[];
  shoppingCount: number;
  onFilterClick: (filter: string) => void;
}

export const PulseStrip: React.FC<PulseStripProps> = ({ foods, shoppingCount, onFilterClick }) => {
  const activeFoods = foods.filter(f => f.status !== 'CONSUMED');
  const urgentFoods = activeFoods.filter(f => f.status === 'COOK_SOON' || f.status === 'EXPIRED');
  const freezerFoods = activeFoods.filter(f => f.compartment === 'FREEZER');

  return (
    <div className="grid grid-cols-4 gap-2">
      {/* Tất cả */}
      <button
        onClick={() => onFilterClick('ALL')}
        className="glass-card p-2.5 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-95 group"
      >
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Layers className="w-3 h-3 text-slate-400 group-hover:text-slate-700 transition-colors" />
          <span>Tất cả</span>
        </div>
        <div className="text-lg font-black text-slate-900 mt-0.5">{activeFoods.length}</div>
      </button>

      {/* Nấu gấp (Neon Amber Glow) */}
      <button
        onClick={() => onFilterClick('URGENT')}
        className={`p-2.5 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-95 border ${
          urgentFoods.length > 0
            ? 'bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent border-amber-400/50 glow-urgent text-amber-900'
            : 'glass-card text-slate-500'
        }`}
      >
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
          <AlertCircle className={`w-3 h-3 ${urgentFoods.length > 0 ? 'text-amber-600 animate-bounce' : 'text-amber-500'}`} />
          <span>Nấu gấp</span>
        </div>
        <div className="text-lg font-black text-amber-600 mt-0.5">{urgentFoods.length}</div>
      </button>

      {/* Ngăn đông (Neon Cyan Glow) */}
      <button
        onClick={() => onFilterClick('FREEZER')}
        className="glass-card p-2.5 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-95 group hover:border-freezer-300"
      >
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-freezer-600">
          <Snowflake className="w-3 h-3 text-freezer-500 group-hover:rotate-45 transition-transform" />
          <span>Ngăn đông</span>
        </div>
        <div className="text-lg font-black text-slate-800 mt-0.5">{freezerFoods.length}</div>
      </button>

      {/* Cần mua (Purple Accent) */}
      <button
        onClick={() => onFilterClick('SHOPPING')}
        className="glass-card p-2.5 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-95 group"
      >
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <ShoppingBag className="w-3 h-3 text-slate-400 group-hover:text-fresh-600 transition-colors" />
          <span>Cần mua</span>
        </div>
        <div className="text-lg font-black text-slate-800 mt-0.5">{shoppingCount}</div>
      </button>
    </div>
  );
};
