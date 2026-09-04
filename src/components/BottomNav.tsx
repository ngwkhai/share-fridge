import React from 'react';
import { Refrigerator, Sparkles, ShoppingBag, History, Mic, Plus } from 'lucide-react';

export type TabType = 'FRIDGE' | 'SHOPPING' | 'HISTORY';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenQuickAdd: () => void;
  onOpenVoice: () => void;
  onOpenRecipe: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenQuickAdd,
  onOpenVoice,
  onOpenRecipe
}) => {
  return (
    <div className="fixed bottom-3 left-0 right-0 z-40 max-w-md mx-auto px-3 safe-bottom">
      {/* Floating White Frosted Glass Dock */}
      <div className="glass-dock-white rounded-3xl px-3 py-2 flex items-center justify-between">
        {/* Tab: Tủ lạnh */}
        <button
          onClick={() => onSelectTab('FRIDGE')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all ${
            currentTab === 'FRIDGE'
              ? 'text-fresh-600 font-extrabold scale-105'
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          <Refrigerator className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Tủ lạnh</span>
        </button>

        {/* Action: Gợi ý món (AI Sparkle) */}
        <button
          onClick={onOpenRecipe}
          className="flex flex-col items-center gap-0.5 py-1 px-2 text-amber-500 hover:text-amber-600 font-extrabold transition-all hover:scale-105 active:scale-95"
        >
          <Sparkles className="w-5 h-5 animate-pulse text-amber-500" />
          <span className="text-[10px] tracking-tight">Nấu gì?</span>
        </button>

        {/* Center Floating Actions (Voice & Add) */}
        <div className="flex items-center gap-1.5 -mt-6">
          <button
            onClick={onOpenVoice}
            aria-label="Thêm món bằng giọng nói"
            className="w-11 h-11 rounded-full bg-white text-slate-700 border border-slate-200 flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-90 transition-transform"
          >
            <Mic className="w-5 h-5 text-fresh-600" />
          </button>
          <button
            onClick={onOpenQuickAdd}
            aria-label="Thêm món mới"
            className="w-[52px] h-[52px] rounded-full bg-gradient-to-tr from-fresh-600 to-emerald-500 text-white flex items-center justify-center shadow-[0_4px_20px_rgba(16,185,129,0.45)] hover:scale-105 active:scale-90 transition-all font-black border-2 border-white"
          >
            <Plus className="w-7 h-7" />
          </button>
        </div>

        {/* Tab: Đi chợ */}
        <button
          onClick={() => onSelectTab('SHOPPING')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all ${
            currentTab === 'SHOPPING'
              ? 'text-fresh-600 font-extrabold scale-105'
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Đi chợ</span>
        </button>

        {/* Tab: Đã dùng */}
        <button
          onClick={() => onSelectTab('HISTORY')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-2xl transition-all ${
            currentTab === 'HISTORY'
              ? 'text-fresh-600 font-extrabold scale-105'
              : 'text-slate-400 hover:text-slate-800'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Đã dùng</span>
        </button>
      </div>
    </div>
  );
};
