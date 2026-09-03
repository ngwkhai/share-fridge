import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { RecipeSuggestion } from '../types';
import { Sparkles, Utensils, Clock, X, RefreshCw } from 'lucide-react';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  onCookRecipe: (recipe: RecipeSuggestion) => Promise<void>;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  onCookRecipe
}) => {
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [cookingId, setCookingId] = useState<string | null>(null);

  const fetchRecipes = async () => {
    setLoading(true);
    try {
      const data = await api.suggestRecipes(roomCode);
      setRecipes(data.suggestions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecipes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCook = async (rec: RecipeSuggestion) => {
    setCookingId(rec.id);
    try {
      await onCookRecipe(rec);
      onClose();
    } finally {
      setCookingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base tracking-tight">Gợi Ý Nấu Ăn Hôm Nay</h3>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-14 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-fresh-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-500">AI đang lên thực đơn từ tủ của bạn...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recipes.map((rec) => (
              <div key={rec.id} className="glass-card rounded-2xl p-4 space-y-3 border border-slate-200/80">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-black text-slate-900 text-sm tracking-tight">{rec.title}</h4>
                  <span className="px-2.5 py-1 bg-slate-100 rounded-full text-[11px] font-bold text-slate-700 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {rec.cook_time_minutes}p
                  </span>
                </div>

                {/* Nguyên liệu tận dụng */}
                <div className="flex flex-wrap gap-1">
                  {rec.ingredients_used.map((item, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-fresh-500/10 text-fresh-800 rounded-lg text-[11px] font-bold border border-fresh-300/40">
                      ✓ {item}
                    </span>
                  ))}
                </div>

                {/* Hướng dẫn ngắn */}
                <div className="space-y-1 text-xs text-slate-600">
                  {rec.instructions.map((step, idx) => (
                    <p key={idx} className="leading-relaxed">{step}</p>
                  ))}
                </div>

                <button
                  onClick={() => handleCook(rec)}
                  disabled={cookingId === rec.id}
                  className="w-full py-2.5 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-98"
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>{cookingId === rec.id ? 'Đang cập nhật...' : 'Nấu món này & Trừ kho'}</span>
                </button>
              </div>
            ))}

            <button
              onClick={fetchRecipes}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Đổi gợi ý khác</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
