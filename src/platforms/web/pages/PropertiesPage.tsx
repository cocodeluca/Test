import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { PropertyFormNew } from '../components/PropertyFormNew';
import { PropertySectionEditModal, type PropertySectionEditorKey } from '../components/PropertySectionEditModal';
import { TaxAssumptionsEditModal } from '../components/TaxAssumptionsEditModal';
import { QuickPropertyCreateModal } from '../components/QuickPropertyCreateModal';
import { PropertyCard } from '../components/PropertyCardExpanded';
import { PortfolioItemSelect } from '../components/PortfolioItemSelect';
import { PropertyDirectory } from '../components/PropertyDirectory';
import type { PropertyTab } from '../components/PropertyCardExpanded';
import { useSettings } from '../context/SettingsContext';
import { SectionCrashBoundary } from '../components/SectionCrashBoundary';
import { ExpenseObligation, ExpensePayment, Mortgage, Property, PropertyExpenseRule, RentPayment, RentReceivable } from '../../../common/types';
import { calculateAllPropertyMetrics, findMortgageByProperty } from '../../../common/utils/calculations';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import { buildPropertyDirectoryItems } from './propertiesDirectoryViewModel';
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
  propertyNavigationTarget?: { propertyId: string; section: 'lease-tenancy'; missingPropertyIds: string[]; currentIndex: number } | null;
  onCompletePropertyNavigation?: () => void;
  onClearPropertyNavigation?: () => void;
  onRequestPropertyTabChange?: (tab: PropertyTab) => void;
  rentReceivables?: RentReceivable[];
  rentPayments?: RentPayment[];
  propertyExpenseRules?: PropertyExpenseRule[];
  expenseObligations?: ExpenseObligation[];
  expensePayments?: ExpensePayment[];
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
  propertyNavigationTarget = null,
  onCompletePropertyNavigation,
  onClearPropertyNavigation,
  onRequestPropertyTabChange,
  rentReceivables = [],
  rentPayments = [],
  propertyExpenseRules = [],
  expenseObligations = [],
  expensePayments = [],
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
    propertyNavigationTarget?.propertyId ?? safeProperties[0]?.id ?? null
  );
  const [showPropertyDetail, setShowPropertyDetail] = useState(Boolean(propertyNavigationTarget));
  const [dueDaySetupIndex, setDueDaySetupIndex] = useState(propertyNavigationTarget?.currentIndex ?? 0);
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
    if (!propertyNavigationTarget || !safeProperties.some((property) => property.id === propertyNavigationTarget.propertyId)) {
      return;
    }

    setSelectedPropertyId(propertyNavigationTarget.propertyId);
    setShowPropertyDetail(true);
    setDueDaySetupIndex(propertyNavigationTarget.currentIndex);
    setUrlPropertyTab('overview');
    writePropertyTabToUrl('overview');
  }, [propertyNavigationTarget, safeProperties]);

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

  const propertyMetrics = useMemo(
    () => calculateAllPropertyMetrics(safeProperties, safeMortgages, settings.currency, getSettingsCurrencyRates(settings)),
    [safeMortgages, safeProperties, settings]
  );
  const directoryItems = useMemo(
    () => buildPropertyDirectoryItems(safeProperties, propertyMetrics, safeMortgages),
    [propertyMetrics, safeMortgages, safeProperties]
  );

  useEffect(() => {
    if (propertyNavigationTarget?.section !== 'lease-tenancy' || !selectedProperty || selectedProperty.id !== propertyNavigationTarget.propertyId) {
      return;
    }

    setSectionEditingProperty(selectedProperty);
    setSectionEditingSection('lease-tenancy');
  }, [propertyNavigationTarget, selectedProperty]);

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
    if (propertyNavigationTarget) {
      onClearPropertyNavigation?.();
    }
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

  const handleSectionPropertySaveAndNext = (updatedProperty: Property) => {
    onEditProperty(updatedProperty);
    if (!propertyNavigationTarget) {
      handleCloseSectionEditor();
      return;
    }

    const nextIndex = propertyNavigationTarget.currentIndex + 1;
    const nextPropertyId = propertyNavigationTarget.missingPropertyIds[nextIndex];
    if (!nextPropertyId) {
      handleCloseSectionEditor();
      onCompletePropertyNavigation?.();
      return;
    }

    const nextProperty = safeProperties.find((property) => property.id === nextPropertyId);
    if (!nextProperty) {
      handleCloseSectionEditor();
      onCompletePropertyNavigation?.();
      return;
    }

    setSelectedPropertyId(nextPropertyId);
    setDueDaySetupIndex(nextIndex);
    setSectionEditingProperty(nextProperty);
    setSectionEditingSection('lease-tenancy');
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

  const handleOpenProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setShowPropertyDetail(true);
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
        {showPropertyDetail ? <div className="flex min-w-0 flex-1 justify-start md:justify-start">
          <PortfolioItemSelect
            ariaLabel={t('properties.selectorTitle')}
            options={selectorItems.map((option) => ({ id: option.id, label: option.title }))}
            selectedId={selectedPropertyId}
            onSelect={setSelectedPropertyId}
          />
        </div> : <div className="hidden flex-1 md:block" />}
        <div className="relative flex shrink-0 md:justify-end">
          <details className="group relative">
            <summary
              data-tutorial-id="properties-add"
              className={`inline-flex min-h-[42px] cursor-pointer list-none items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium ${appButtonPrimaryClass} ${tutorialTargetId === 'properties-add' ? 'app-tutorial-target' : ''}`}
            >
              <Plus className="h-4.5 w-4.5" />
              <span>{t('properties.addProperty')}</span>
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

      {!showPropertyDetail ? (
        <PropertyDirectory
          items={directoryItems}
          onOpenProperty={handleOpenProperty}
          onAddProperty={openQuickForm}
        />
      ) : safeProperties.length === 0 || !selectedProperty ? (
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
          <button
            type="button"
            onClick={() => setShowPropertyDetail(false)}
            className={`mb-3 text-sm font-semibold ${appTextMutedClass} transition hover:text-sky-700 dark:hover:text-sky-300`}
          >
            {t('properties.directory.backToList')}
          </button>
          {selectedProperty ? (
            <SectionCrashBoundary sectionName="property-expanded card">
              <PropertyExpandedMountLogger />
              <PropertyCard
                property={selectedProperty}
                rentReceivables={rentReceivables}
                rentPayments={rentPayments}
                propertyExpenseRules={propertyExpenseRules}
                expenseObligations={expenseObligations}
                expensePayments={expensePayments}
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
            rentReceivables={rentReceivables}
            rentPayments={rentPayments}
            dueDaySetupContext={propertyNavigationTarget ? { position: dueDaySetupIndex + 1, total: propertyNavigationTarget.missingPropertyIds.length } : undefined}
            onSaveAndNext={propertyNavigationTarget ? handleSectionPropertySaveAndNext : undefined}
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
