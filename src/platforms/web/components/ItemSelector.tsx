import React from 'react';
import {
  appBorderClass,
  appButtonMutedClass,
  appPanelClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

interface SelectorItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

interface ItemSelectorProps {
  title: string;
  items: SelectorItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage: string;
}

export const ItemSelector: React.FC<ItemSelectorProps> = ({
  title,
  items,
  selectedId,
  onSelect,
  emptyMessage,
}) => {
  return (
    <div className={`overflow-hidden ${appPanelClass} rounded-[24px]`}>
      <div className={`border-b px-4 py-3.5 ${appBorderClass}`}>
        <h2 className={`text-[13px] font-semibold uppercase tracking-[0.18em] ${appTextMutedClass}`}>
          {title}
        </h2>
      </div>

      {items.length === 0 ? (
        <div className={`px-4 py-10 text-center text-sm ${appTextSoftClass}`}>
          {emptyMessage}
        </div>
      ) : (
        <div className="md:max-h-[calc(100vh-18rem)] md:overflow-y-auto">
          <div className="flex snap-x gap-2.5 overflow-x-auto px-3 py-3 md:block md:space-y-2 md:p-4">
            {items.map((item) => {
              const isActive = item.id === selectedId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`min-w-[192px] snap-start rounded-2xl border px-3.5 py-3 text-left transition md:w-full md:min-w-0 md:px-4 ${
                    isActive
                      ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_18px_36px_-28px_rgba(34,211,238,0.35)]'
                      : `${appButtonMutedClass} hover:border-[var(--app-border-strong)]`
                  }`}
                >
                  <p className={`text-sm font-semibold leading-5 ${isActive ? 'text-cyan-700 dark:text-white' : appTextStrongClass}`}>
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className={`mt-1 text-[13px] leading-5 ${isActive ? 'text-cyan-700/80 dark:text-cyan-200' : appTextMutedClass}`}>
                      {item.subtitle}
                    </p>
                  )}
                  {item.meta && (
                    <p className={`mt-2 text-[11px] font-medium uppercase tracking-[0.16em] ${isActive ? 'text-cyan-700 dark:text-cyan-300' : appTextSoftClass}`}>
                      {item.meta}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
