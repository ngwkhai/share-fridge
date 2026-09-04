import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { RecipeSuggestion } from '../types';
import { Sparkles, Utensils, Clock, X, RefreshCw, Check } from 'lucide-react';
import { Dialog } from './Dialog';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  onCookRecipe: (recipe: RecipeSuggestion, idempotencyKey: string) => Promise<void>;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({ isOpen, onClose, roomCode, onCookRecipe }) => {
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [cookingId, setCookingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  const attemptKeys = useRef(new Map<string, string>());

  const fetchRecipes = async () => {
    if (pending.current) return;
    const ticket = ++generation.current;
    const token = api.sessionCache.get()?.token;
    setLoading(true); setError(''); setRecipes([]); setSource('');
    try {
      const data = await api.suggestRecipes(roomCode);
      if (ticket !== generation.current || token !== api.sessionCache.get()?.token) return;
      setRecipes(data.suggestions); setSource(data.source); attemptKeys.current.clear();
    } catch (err) {
      if (ticket === generation.current && token === api.sessionCache.get()?.token) setError(err instanceof Error ? err.message : 'Chưa lấy được gợi ý. Hãy thử lại.');
    } finally { if (ticket === generation.current) setLoading(false); }
  };

  useEffect(() => {
    pending.current = false; setCookingId(null); attemptKeys.current.clear();
    if (isOpen) void fetchRecipes();
    return () => { generation.current++; };
  }, [isOpen, roomCode]);

  if (!isOpen) return null;

  const handleCook = async (recipe: RecipeSuggestion) => {
    if (pending.current) return;
    pending.current = true;
    const ticket = generation.current;
    const token = api.sessionCache.get()?.token;
    const key = attemptKeys.current.get(recipe.id) || crypto.randomUUID();
    attemptKeys.current.set(recipe.id, key);
    setCookingId(recipe.id); setError('');
    try {
      await onCookRecipe(recipe, key);
      if (ticket === generation.current && token === api.sessionCache.get()?.token) onClose();
    } catch (err) {
      if (ticket === generation.current && token === api.sessionCache.get()?.token) setError(err instanceof Error ? err.message : 'Chưa xác nhận được lần nấu. Thử lại để kiểm tra cùng lần nấu này.');
    } finally {
      if (ticket === generation.current) { pending.current = false; setCookingId(null); }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={!!cookingId}
      labelledBy="recipe-title"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto"
    >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
            <h3 id="recipe-title" className="font-black text-slate-900 text-base">Gợi ý nấu ăn hôm nay</h3>
          </div>
          <button onClick={onClose} disabled={!!cookingId} aria-label="Đóng gợi ý nấu ăn" className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-50"><X className="w-4 h-4" /></button>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 rounded-xl p-3">{error}</p>}
        {loading ? (
          <div role="status" className="py-14 text-center space-y-3"><RefreshCw className="w-8 h-8 text-emerald-600 motion-safe:animate-spin mx-auto" /><p className="text-sm text-slate-600">Đang tìm món từ thực phẩm còn hạn...</p></div>
        ) : (
          <div className="space-y-4">
            {source && <p className="text-xs text-slate-600">{source === 'heuristic' ? 'Gợi ý cơ bản, chưa có kết quả từ Gemini. Hãy kiểm tra nguyên liệu trước khi nấu.' : 'Gợi ý từ Gemini; chỉ chọn thực phẩm còn hạn trong tủ.'}</p>}
            {!recipes.length && !error && <p className="py-6 text-sm text-slate-600">Chưa có món phù hợp với thực phẩm còn hạn. Bạn có thể thêm thực phẩm rồi thử lại.</p>}
            {recipes.map(recipe => (
              <div key={recipe.id} className="rounded-2xl p-4 space-y-3 border border-slate-200">
                <div className="flex items-start justify-between gap-2"><h4 className="font-bold text-slate-900 text-sm">{recipe.title}</h4><span className="px-2.5 py-1 bg-slate-100 rounded-full text-xs text-slate-700 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{recipe.cook_time_minutes} phút</span></div>
                <div><p className="text-xs font-semibold text-slate-700 mb-1">Có trong tủ</p><div className="flex flex-wrap gap-1">{recipe.ingredients_used.map((item, index) => <span key={index} className="px-2 py-1 bg-emerald-50 text-emerald-800 rounded-lg text-xs inline-flex items-center gap-1"><Check className="w-3 h-3" />{item}</span>)}</div></div>
                {!!recipe.ingredients_missing.length && <div className="rounded-xl p-3 bg-amber-50 text-amber-900 text-xs"><p className="font-semibold">Cần chuẩn bị thêm</p><p>{recipe.ingredients_missing.join(', ')}</p></div>}
                <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-600">{recipe.instructions.map((step, index) => <li key={index} className="leading-relaxed">{step}</li>)}</ol>
                <p className="text-xs text-slate-500">Xác nhận sẽ đánh dấu đã dùng toàn bộ {recipe.food_ids.length} món đồ bên trên.</p>
                <button onClick={() => void handleCook(recipe)} disabled={!!cookingId} className="w-full min-h-11 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"><Utensils className="w-4 h-4" /><span>{cookingId === recipe.id ? 'Đang cập nhật...' : 'Đã nấu món này'}</span></button>
              </div>
            ))}
            <button onClick={() => void fetchRecipes()} disabled={!!cookingId} className="w-full min-h-11 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold rounded-xl text-sm flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />Lấy gợi ý mới</button>
          </div>
        )}
    </Dialog>
  );
};
