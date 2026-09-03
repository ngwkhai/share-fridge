import React from 'react';

export type FilterCategory = 'ALL' | 'URGENT' | 'FREEZER' | 'FRIDGE' | 'CRISPER' | 'DOOR';

interface FilterBarProps {
  activeFilter: FilterCategory;
  onSelectFilter: (filter: FilterCategory) => void;
}

const filterOptions: { id: FilterCategory; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'URGENT', label: '⚠️ Nấu gấp' },
  { id: 'FREEZER', label: '❄️ Ngăn đông' },
  { id: 'FRIDGE', label: '🥩 Ngăn mát' },
  { id: 'CRISPER', label: '🥬 Hộc rau' },
  { id: 'DOOR', label: '🥚 Cánh tủ' },
];

export const FilterBar: React.FC<FilterBarProps> = ({ activeFilter, onSelectFilter }) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
      {filterOptions.map((opt) => {
        const isActive = activeFilter === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onSelectFilter(opt.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-150 ${
              isActive
                ? 'bg-slate-900 text-white shadow-sm scale-105'
                : 'glass-card text-slate-600 hover:text-slate-900'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
