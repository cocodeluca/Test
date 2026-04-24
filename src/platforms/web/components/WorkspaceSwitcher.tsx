import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  appBorderClass,
  appButtonMutedClass,
  appPanelClass,
  appPanelInsetClass,
  appSelectClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

export interface WorkspaceSwitcherItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

interface WorkspaceSwitcherProps {
  label: string;
  items: WorkspaceSwitcherItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage: string;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  label,
  items,
  selectedId,
  onSelect,
  emptyMessage,
}) => {
  const selectedIndex = useMemo(
    () => items.findIndex((item) => item.id === selectedId),
    [items, selectedId]
  );

  const currentItem =
    selectedIndex >= 0 ? items[selectedIndex] : items[0] ?? null;

  const goToPrevious = () => {
    if (items.length <= 1 || selectedIndex < 0) {
      return;
    }

    const previousIndex =
      selectedIndex === 0 ? items.length - 1 : selectedIndex - 1;
    onSelect(items[previousIndex].id);
  };

  const goToNext = () => {
    if (items.length <= 1 || selectedIndex < 0) {
      return;
    }

    const nextIndex =
      selectedIndex === items.length - 1 ? 0 : selectedIndex + 1;
    onSelect(items[nextIndex].id);
  };

  return (
    <div className={`${appPanelClass} overflow-hidden rounded-[24px]`}>
      <div
        className={`flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${appBorderClass}`}
      >
        <div>
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}
          >
            {label}
          </p>
          <p className={`mt-1 text-sm ${appTextMutedClass}`}>
            {items.length > 0 ? `${items.length} total` : emptyMessage}
          </p>
        </div>

        {items.length > 0 ? (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={goToPrevious}
              className={`rounded-full p-2 transition ${appButtonMutedClass} ${appTextMutedClass}`}
              aria-label={`Previous ${label.toLowerCase()}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToNext}
              className={`rounded-full p-2 transition ${appButtonMutedClass} ${appTextMutedClass}`}
              aria-label={`Next ${label.toLowerCase()}`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className={`px-4 py-10 text-center text-sm ${appTextSoftClass}`}>
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-center">
          <label className="min-w-0">
            <span className="sr-only">{label}</span>
            <select
              value={currentItem?.id ?? ''}
              onChange={(event) => onSelect(event.target.value)}
              className={`w-full ${appSelectClass} ${appTextStrongClass}`}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          {currentItem ? (
            <div className={`flex min-w-0 flex-col gap-1 rounded-2xl px-4 py-3 ${appPanelInsetClass}`}>
              <p className={`truncate text-sm font-semibold ${appTextStrongClass}`}>
                {currentItem.title}
              </p>
              {currentItem.subtitle ? (
                <p className={`truncate text-[13px] ${appTextMutedClass}`}>
                  {currentItem.subtitle}
                </p>
              ) : null}
              {currentItem.meta ? (
                <p
                  className={`truncate text-[11px] font-medium uppercase tracking-[0.14em] ${appTextSoftClass}`}
                >
                  {currentItem.meta}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
