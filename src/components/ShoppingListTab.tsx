import React, { useState } from 'react';
import { ShoppingItem } from '../types';
import { Plus, Check, Trash2, ShoppingBag } from 'lucide-react';

interface ShoppingListTabProps {
  items: ShoppingItem[];
  onAddItem: (name: string, quantity?: string) => Promise<void>;
  onToggleItem: (id: string, isBought: boolean) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

export const ShoppingListTab: React.FC<ShoppingListTabProps> = ({
  items,
  onAddItem,
  onToggleItem,
  onDeleteItem
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setLoading(true);
    try {
      await onAddItem(newItemName.trim());
      setNewItemName('');
    } finally {
      setLoading(false);
    }
  };

  const pendingItems = items.filter(i => !i.is_bought);
  const boughtItems = items.filter(i => i.is_bought);

  return (
    <div className="space-y-4">
      {/* Quick Add Bar */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Cần mua thêm món gì? (VD: Dầu ăn, nước mắm...)"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-fresh-500 focus:outline-none shadow-xs"
        />
        <button
          type="submit"
          disabled={loading || !newItemName.trim()}
          className="px-4 py-2.5 bg-fresh-600 hover:bg-fresh-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center shrink-0 shadow-xs"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      {/* Items list */}
      <div className="space-y-3">
        {pendingItems.length === 0 && boughtItems.length === 0 ? (
          <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center space-y-2 p-4">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Danh sách đi chợ trống</h4>
            <p className="text-xs text-slate-500">Món ăn khi hết trong tủ sẽ tự động gợi ý vào đây</p>
          </div>
        ) : null}

        {/* Chưa mua */}
        {pendingItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Cần mua ({pendingItems.length})
            </h4>
            <div className="space-y-1.5">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs"
                >
                  <button
                    onClick={() => onToggleItem(item.id, true)}
                    className="flex items-center gap-3 text-left flex-1"
                  >
                    <div className="w-5 h-5 rounded-md border-2 border-slate-300 hover:border-fresh-500 flex items-center justify-center transition-colors"></div>
                    <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                  </button>
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1 text-slate-400 hover:text-danger-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Đã mua */}
        {boughtItems.length > 0 && (
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              Đã mua ({boughtItems.length})
            </h4>
            <div className="space-y-1.5 opacity-60">
              {boughtItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <button
                    onClick={() => onToggleItem(item.id, false)}
                    className="flex items-center gap-2.5 text-left flex-1"
                  >
                    <div className="w-5 h-5 rounded-md bg-fresh-600 text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs line-through text-slate-600 font-medium">{item.name}</span>
                  </button>
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1 text-slate-400 hover:text-danger-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
