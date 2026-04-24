import React from 'react';
import { LayoutGrid, Rows, X } from 'lucide-react';
import {
  appBorderClass,
  appOverlayClass,
  appPanelClass,
} from '../styles/dashboardTheme';

export interface CompactEditSectionItem {
  id: string;
  label: string;
}

interface CompactEditModalProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onClose: () => void;
  sections?: CompactEditSectionItem[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  sectionStatusById?: Record<string, { unsaved?: boolean } | undefined>;
  mode?: 'section' | 'full';
  onModeChange?: (mode: 'section' | 'full') => void;
  sectionWidthClassName?: string;
  fullWidthClassName?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  sectionsAreLocked?: boolean;
}

export const CompactEditModal: React.FC<CompactEditModalProps> = ({
  title,
  subtitle,
  eyebrow,
  onClose,
  sections = [],
  activeSection,
  onSectionChange,
  sectionStatusById,
  mode = 'section',
  onModeChange,
  sectionWidthClassName = 'sm:max-w-3xl',
  fullWidthClassName = 'sm:max-w-5xl',
  aside,
  children,
  footer,
  sectionsAreLocked = false,
}) => {
  const widthClassName = mode === 'full' ? fullWidthClassName : sectionWidthClassName;
  const hasSectionNav = sections.length > 0 && activeSection && onSectionChange;
  const hasModeToggle = Boolean(onModeChange);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-[14px] sm:items-center sm:p-4 ${appOverlayClass}`}
    >
      <div
        className={`flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-[rgba(215,224,234,0.95)] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_36px_100px_-46px_rgba(15,23,42,0.52)] sm:max-h-[92vh] ${widthClassName} sm:rounded-[30px]`}
      >
        <div className={`shrink-0 border-b border-[rgba(214,224,234,0.92)] bg-[linear-gradient(180deg,#ffffff_0%,#f9fcff_100%)]`}>
          <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--app-text-soft)]">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="mt-1.5 text-[1.55rem] font-semibold tracking-[-0.04em] text-[var(--app-text-strong)] sm:text-[1.95rem]">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--app-text-soft)] sm:text-sm">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-[rgba(214,224,234,0.98)] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-2.5 text-[var(--app-text-muted)] shadow-[0_10px_20px_-18px_rgba(15,23,42,0.2)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-strong)] hover:shadow-[0_14px_22px_-18px_rgba(15,23,42,0.22)]"
              aria-label="Close editor"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {hasSectionNav || hasModeToggle ? (
            <div className="flex flex-col gap-3 border-t border-[rgba(214,224,234,0.92)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              {hasSectionNav ? (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {sections.map((section) => {
                    const isActive = section.id === activeSection;
                    const isDisabled = sectionsAreLocked && !isActive;

                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => !isDisabled && onSectionChange(section.id)}
                        disabled={isDisabled}
                        className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                          isActive
                            ? 'border border-[rgba(37,99,235,0.24)] bg-[rgba(37,99,235,0.1)] text-[rgba(23,55,120,1)] shadow-[0_12px_24px_-20px_rgba(37,99,235,0.45)]'
                            : isDisabled
                            ? 'cursor-not-allowed border border-[rgba(214,224,234,0.95)] bg-[rgba(247,250,253,0.9)] text-[var(--app-text-soft)] opacity-55'
                            : 'border border-[rgba(214,224,234,0.95)] bg-white text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:bg-[rgba(247,250,253,0.95)] hover:text-[var(--app-text-strong)]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          {section.label}
                          {!isActive && sectionsAreLocked ? <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-soft)]">Locked</span> : null}
                          {sectionStatusById?.[section.id]?.unsaved ? (
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div />
              )}

              {hasModeToggle ? (
                <div className={`inline-flex rounded-full border border-[rgba(214,224,234,0.92)] bg-[rgba(247,250,253,0.92)] p-1 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.18)] ${appPanelClass}`}>
                  <button
                    type="button"
                    onClick={() => onModeChange?.('section')}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      mode === 'section'
                        ? 'border border-[rgba(37,99,235,0.24)] bg-white text-[rgba(23,55,120,1)] shadow-[0_10px_20px_-16px_rgba(37,99,235,0.4)]'
                        : 'border border-transparent bg-transparent text-[var(--app-text-muted)] hover:bg-white hover:text-[var(--app-text-strong)]'
                    }`}
                  >
                    <Rows className="h-3.5 w-3.5" />
                    Section Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onModeChange?.('full')}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      mode === 'full'
                        ? 'border border-[rgba(37,99,235,0.24)] bg-white text-[rgba(23,55,120,1)] shadow-[0_10px_20px_-16px_rgba(37,99,235,0.4)]'
                        : 'border border-transparent bg-transparent text-[var(--app-text-muted)] hover:bg-white hover:text-[var(--app-text-strong)]'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Edit Full Record
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className={`flex min-h-0 flex-1 overflow-hidden ${
            aside ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_320px]' : ''
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="modal-scroll-body min-h-0 flex-1">{children}</div>
            {footer ? (
              <div className="modal-footer shrink-0 px-4 py-4 sm:px-6">{footer}</div>
            ) : null}
          </div>
          {aside ? (
            <aside className={`hidden min-h-0 overflow-y-auto border-l xl:block ${appBorderClass}`}>
              {aside}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
};
