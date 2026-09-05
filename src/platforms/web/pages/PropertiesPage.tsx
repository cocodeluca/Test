import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { PropertyFormNew } from '../components/PropertyFormNew';
import { PropertySectionEditModal, type PropertySectionEditorKey } from '../components/PropertySectionEditModal';
import { TaxAssumptionsEditModal } from '../components/TaxAssumptionsEditModal';
import { QuickPropertyCreateModal } from '../components/QuickPropertyCreateModal';
import { PropertyCard } from '../components/PropertyCardExpanded';
import type { PropertyTab } from '../components/PropertyCardExpanded';
import { useSettings } from '../context/SettingsContext';
import { SectionCrashBoundary } from '../components/SectionCrashBoundary';
import { Mortgage, Property } from '../../../common/types';
import { findMortgageByProperty } from '../../../common/utils/calculations';
import {
  appButtonPrimaryClass,
  appPanelClass,
  appTextMutedClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';

const PropertyExpandedMountLogger = () => {
  useEffect(() => {
    console.info('[mount] property-expanded');
  }, []);

  return null;
};

interface PropertiesPageProps {
  properties: Property[];
  mortgages: Mortgage[];
  onAddProperty: (property: Property) => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (id: string) => void;
  onGenerateReport: (sourceType: 'opportunity' | 'property' | 'rehab', sourceId: string) => void;
  tutorialTargetId?: string | null;
  onRequestOpenAddProperty?: () => void;
  autoOpenQuickCreate?: boolean;
  tutorialQuickCreateState?: boolean | null;
  tutorialQuickCreateStep?: number | null;
  propertyTabOverride?: PropertyTab | 'summary' | 'tax' | null;
  onRequestPropertyTabChange?: (tab: PropertyTab) => void;
}

const PROPERTY_TAB_QUERY_KEY = 'propertyTab';

const normalizePropertyTab = (tab: string | null | undefined): PropertyTab | null => {
  switch (tab) {
    case 'summary':
    case 'overview':
      return 'overview';
    case 'finances':
    case 'mortgage':
    case 'documents':
    case 'notes':
    case 'gallery':
      return tab;
    case 'tax':
    case 'taxes':
      return 'taxes';
    default:
      return null;
  }
};

const readPropertyTabFromUrl = (): PropertyTab | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return normalizePropertyTab(
    new URLSearchParams(window.location.search).get(PROPERTY_TAB_QUERY_KEY)
  );
};

const writePropertyTabToUrl = (tab: PropertyTab) => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(PROPERTY_TAB_QUERY_KEY, tab);
  window.history.replaceState(window.history.state, '', url.toString());
};

export const PropertiesPage: React.FC<PropertiesPageProps> = ({
  properties,
  mortgages,
  onAddProperty,
  onEditProperty,
  onDeleteProperty,
  onGenerateReport,
  tutorialTargetId = null,
  onRequestOpenAddProperty,
  autoOpenQuickCreate = false,
  tutorialQuickCreateState = null,
  tutorialQuickCreateStep = null,
  propertyTabOverride = null,
  onRequestPropertyTabChange,
}) => {
  const { settings, t } = useSettings();
  const safeProperties = Array.isArray(properties) ? properties : [];
  const safeMortgages = Array.isArray(mortgages) ? mortgages : [];
  const hadInvalidRuntimeState = !Array.isArray(properties) || !Array.isArray(mortgages);
  const [showForm, setShowForm] = useState(false);
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [sectionEditingProperty, setSectionEditingProperty] = useState<Property | null>(null);
  const [sectionEditingSection, setSectionEditingSection] = useState<PropertySectionEditorKey | null>(null);
  const [taxEditingProperty, setTaxEditingProperty] = useState<Property | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    safeProperties[0]?.id ?? null
  );
  const [urlPropertyTab, setUrlPropertyTab] = useState<PropertyTab>(() => readPropertyTabFromUrl() ?? 'overview');

  useEffect(() => {
    if (autoOpenQuickCreate) {
      setShowQuickForm(true);
    }
  }, [autoOpenQuickCreate]);

  useEffect(() => {
    if (hadInvalidRuntimeState && safeProperties.length >= 0) {
      console.warn('[runtime-fix] properties route recovered from invalid state');
    }
  }, [hadInvalidRuntimeState, safeProperties.length]);

  useEffect(() => {
    if (tutorialQuickCreateState === null) {
      return;
    }

    setShowQuickForm(tutorialQuickCreateState);
  }, [tutorialQuickCreateState]);

  useEffect(() => {
    if (safeProperties.length === 0) {
      setSelectedPropertyId(null);
      return;
    }

    const selectedStillExists = selectedPropertyId
      ? safeProperties.some((property) => property.id === selectedPropertyId)
      : false;

    if (!selectedStillExists) {
      setSelectedPropertyId(safeProperties[0].id);
    }
  }, [safeProperties, selectedPropertyId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncFromLocation = () => {
      setUrlPropertyTab(readPropertyTabFromUrl() ?? 'overview');
    };

    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const selectedProperty = useMemo(
    () => safeProperties.find((property) => property.id === selectedPropertyId) ?? null,
    [safeProperties, selectedPropertyId]
  );

  const selectorItems = useMemo(
    () =>
      safeProperties.map((property) => ({
        id: property.id,
        title: property.name,
        subtitle: `${property.city}, ${property.country}`,
        meta: property.propertyType || property.occupancyStatus.replace(/-/g, ' '),
      })),
    [safeProperties]
  );
  const mapSectionToEditor = (section: string | null): PropertySectionEditorKey | null => {
    switch (section) {
      case 'gallery':
        return 'gallery';
      case 'documents':
        return 'documents';
      case 'lease':
      case 'lease-tenancy':
        return 'lease-tenancy';
      case 'basic-info':
      case 'property-details':
        return 'property-details';
      case 'investment-summary':
      case 'purchase-details':
        return 'purchase-details';
      default:
        return null;
    }
  };

  const handleOpenEditForm = (property: Property, section: string | null = null) => {
    if (section === null) {
      setEditingPropertyId(property.id);
      setEditingProperty(property);
      setEditingSection(section);
      setShowForm(true);
      return;
    }

    const nextSection = mapSectionToEditor(section);

    if (nextSection) {
      setSectionEditingProperty(property);
      setSectionEditingSection(nextSection);
      return;
    }

    if (section === 'tax-assumptions') {
      setTaxEditingProperty(property);
      return;
    }

    if (section === 'spain-tax-settings' || section === 'deductible-expenses') {
      setTaxEditingProperty(property);
    }
  };

  const openQuickForm = () => {
    onRequestOpenAddProperty?.();
    setShowQuickForm(true);
  };

  const trackingPreference = settings.onboarding.trackingPreference ?? 'full-portfolio';
  const isBasicMode = settings.userMode === 'basic';

  const openAdvancedForm = () => {
    onRequestOpenAddProperty?.();
    setShowQuickForm(false);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingPropertyId(null);
    setEditingProperty(null);
    setEditingSection(null);
  };

  const handleCloseSectionEditor = () => {
    setSectionEditingProperty(null);
    setSectionEditingSection(null);
  };

  const handleCloseTaxEditor = () => {
    setTaxEditingProperty(null);
  };

  const handleAddPropertySubmit = (newProperty: Property) => {
    onAddProperty(newProperty);
    setSelectedPropertyId(newProperty.id);
    setShowQuickForm(false);
    handleCloseForm();
  };

  const handleEditPropertySubmit = (updatedProperty: Property) => {
    onEditProperty(updatedProperty);
    setSelectedPropertyId(updatedProperty.id);
    handleCloseForm();
  };

  const handleSectionPropertySave = (updatedProperty: Property) => {
    onEditProperty(updatedProperty);
    setSelectedPropertyId(updatedProperty.id);
    handleCloseSectionEditor();
  };

  const handleTaxPropertySave = (updatedProperty: Property) => {
    onEditProperty(updatedProperty);
    setSelectedPropertyId(updatedProperty.id);
    handleCloseTaxEditor();
  };

  const handleDeletePropertySubmit = (propertyId: string) => {
    onDeleteProperty(propertyId);
  };

  const selectedMortgage =
    selectedProperty && selectedProperty.id
      ? findMortgageByProperty(selectedProperty.id, safeMortgages)
      : undefined;
  const normalizedOverride = normalizePropertyTab(propertyTabOverride);
  const activePropertyTab = normalizedOverride ?? urlPropertyTab;
  const handlePropertyTabChange = (tab: PropertyTab) => {
    setUrlPropertyTab(tab);
    writePropertyTabToUrl(tab);
    onRequestPropertyTabChange?.(tab);
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className="min-w-0">
          <h1 className={`text-[1.65rem] font-semibold tracking-[-0.04em] md:text-[2.25rem] ${appTextStrongClass}`}>{t('properties.title')}</h1>
          <p className={`mt-1.5 text-[13px] leading-5 md:text-sm ${appTextMutedClass}`}>
            {t(
              safeProperties.length === 1
                ? 'properties.propertyCount_one'
                : 'properties.propertyCount_other',
              { count: safeProperties.length }
            )}{' '}
            - {t('properties.managePortfolio')}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 justify-start md:justify-start">
          {safeProperties.length > 1 ? (
            <label className={`inline-flex w-full max-w-[320px] items-center gap-2 rounded-2xl border px-3.5 py-2 shadow-[0_10px_22px_-26px_rgba(15,23,42,0.16)] ${appPanelClass} ${appTextStrongClass}`}>
              <span className="sr-only">{t('properties.selectorTitle')}</span>
              <div className="min-w-0 flex-1">
                <select
                  value={selectedPropertyId ?? safeProperties[0]?.id ?? ''}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                  className={`w-full appearance-none border-0 bg-transparent p-0 pr-6 text-[13px] font-medium leading-5 outline-none ring-0 ${appTextStrongClass}`}
                >
                  {selectorItems.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 ${appTextMutedClass}`} />
            </label>
          ) : null}
        </div>
        <div className="relative flex shrink-0 md:justify-end">
          <details className="group relative">
            <summary
              data-tutorial-id="properties-add"
              className={`inline-flex min-h-[42px] cursor-pointer list-none items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium ${appButtonPrimaryClass} ${tutorialTargetId === 'properties-add' ? 'app-tutorial-target' : ''}`}
            >
              <Plus className="h-4.5 w-4.5" />
              <span>{t('common.addProperty')}</span>
              <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
            </summary>
            <div className={`absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border p-1.5 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.32)] ${appPanelClass}`}>
              <button
                type="button"
                onClick={openQuickForm}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] font-medium transition hover:bg-[var(--app-panel-inset)] ${appTextStrongClass}`}
              >
                {t('common.addPropertyManually')}
              </button>
              {!isBasicMode || settings.showAdvancedBasicModeFeatures ? (
                <button
                  type="button"
                  onClick={openAdvancedForm}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-[var(--app-panel-inset)] ${appTextMutedClass}`}
                >
                  {t('common.advancedForm')}
                </button>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      {safeProperties.length === 0 || !selectedProperty ? (
        <div className={`${appPanelClass} px-6 py-16 text-center sm:px-10 sm:py-20`}>
          <div className="mx-auto max-w-2xl">
            <h2 className={`text-[2rem] font-semibold tracking-[-0.04em] sm:text-[2.5rem] ${appTextStrongClass}`}>
              {t('propertiesUi.emptyTitle')}
            </h2>
            <p className={`mt-3 text-lg font-medium tracking-[-0.02em] ${appTextStrongClass}`}>
              {t('propertiesUi.emptySubtitle')}
            </p>
            <p className={`mx-auto mt-4 max-w-[44rem] text-sm leading-7 sm:text-[15px] ${appTextMutedClass}`}>
              {t('propertiesUi.emptyBody')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={openQuickForm}
              data-tutorial-id="properties-add"
              className={`mt-8 inline-flex items-center gap-2 px-6 py-3 ${appButtonPrimaryClass}`}
            >
              <Plus className="w-5 h-5" />
              {t('common.addPropertyManually')}
            </button>
            {!isBasicMode || settings.showAdvancedBasicModeFeatures ? (
              <button
                onClick={openAdvancedForm}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/70 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-300 dark:hover:border-sky-500/35 dark:hover:text-sky-300"
              >
                {t('common.openAdvancedForm')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="min-w-0">
          {selectedProperty ? (
            <SectionCrashBoundary sectionName="property-expanded card">
              <PropertyExpandedMountLogger />
              <PropertyCard
                property={selectedProperty}
                mortgage={selectedMortgage}
                onDelete={handleDeletePropertySubmit}
                onEdit={handleOpenEditForm}
                onGenerateReport={(property) => onGenerateReport('property', property.id)}
                activeTabOverride={activePropertyTab}
                onRequestTabChange={handlePropertyTabChange}
                tutorialTargetId={tutorialTargetId}
              />
            </SectionCrashBoundary>
          ) : (
            <div className={`${appPanelClass} p-12 text-center`}>
              <p className={`text-lg font-medium ${appTextStrongClass}`}>
                {t('properties.selectProperty')}
              </p>
              <p className={`mt-2 text-sm ${appTextMutedClass}`}>
                {t('properties.selectPropertyHelp')}
              </p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <PropertyFormNew
          isEditing={editingPropertyId !== null}
          editingProperty={editingProperty}
          initialSection={editingSection}
          onAddProperty={handleAddPropertySubmit}
          onEditProperty={handleEditPropertySubmit}
          onClose={handleCloseForm}
          tutorialTargetId={tutorialTargetId}
        />
      )}

      {sectionEditingProperty && sectionEditingSection ? (
        <SectionCrashBoundary sectionName="property-expanded card">
          <PropertyExpandedMountLogger />
          <PropertySectionEditModal
            property={sectionEditingProperty}
            section={sectionEditingSection}
            onClose={handleCloseSectionEditor}
            onSave={handleSectionPropertySave}
          />
        </SectionCrashBoundary>
      ) : null}

      {taxEditingProperty ? (
        <SectionCrashBoundary sectionName="property-expanded card">
          <PropertyExpandedMountLogger />
          <TaxAssumptionsEditModal
            property={taxEditingProperty}
            onClose={handleCloseTaxEditor}
            onSave={handleTaxPropertySave}
          />
        </SectionCrashBoundary>
      ) : null}

      {showQuickForm ? (
        <QuickPropertyCreateModal
          onClose={() => setShowQuickForm(false)}
          onCreateProperty={handleAddPropertySubmit}
          basicMode={isBasicMode}
          trackingPreference={trackingPreference}
          tutorialStepOverride={tutorialQuickCreateStep}
          onOpenAdvancedForm={() => {
            setShowQuickForm(false);
            openAdvancedForm();
          }}
        />
      ) : null}
    </div>
  );
};
