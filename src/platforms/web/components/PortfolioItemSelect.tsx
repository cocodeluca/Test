import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  appPanelClass,
  appTextMutedClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

export interface PortfolioItemSelectOption {
  id: string;
  label: string;
}

interface PortfolioItemSelectProps {
  ariaLabel: string;
  options: PortfolioItemSelectOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const PortfolioItemSelect: React.FC<PortfolioItemSelectProps> = ({
  ariaLabel,
  options,
  selectedId,
  onSelect,
}) => {
  if (options.length <= 1) {
    return null;
  }

  return (
    <label className={`inline-flex w-full max-w-[320px] items-center gap-2 rounded-2xl border px-3.5 py-2 shadow-[0_10px_22px_-26px_rgba(15,23,42,0.16)] ${appPanelClass} ${appTextStrongClass}`}>
      <span className="sr-only">{ariaLabel}</span>
      <div className="min-w-0 flex-1">
        <select
          aria-label={ariaLabel}
          value={selectedId ?? options[0]?.id ?? ''}
          onChange={(event) => onSelect(event.target.value)}
          className={`w-full appearance-none border-0 bg-transparent p-0 pr-6 text-[13px] font-medium leading-5 outline-none ring-0 ${appTextStrongClass}`}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <ChevronDown className={`h-4 w-4 shrink-0 ${appTextMutedClass}`} />
    </label>
  );
};
