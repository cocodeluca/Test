
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Bath,
  Banknote,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Edit,
  Expand,
  FileText,
  FolderOpen,
  Home,
  Landmark,
  MapPin,
  Plus,
  Percent,
  Receipt,
  Ruler,
  Shield,
  StickyNote,
  TrendingUp,
  Trash2,
  Wallet2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Mortgage, Property } from '../../../common/types';
import {
  calculateCurrentRate,
  calculateRemainingMortgageMonths,
  calculatePropertyDetails,
} from '../../../common/utils/calculations';
import { calculatePropertyTaxRuntime } from '../../../common/tax';
import { convertCurrency } from '../../../common/utils/currency';
import {
  calculateLeaseAdjustmentHistory,
  calculateLeaseNextUpdateDate,
  getActiveLease,
  summarizeRentUpdateRule,
} from '../../../common/utils/leaseUpdates';
import {
  formatMortgageTermMonths,
  formatMortgageTermYears,
  formatPortfolioDisplayCurrency,
  formatPercentage,
} from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';
import { normalizeGalleryUrls, useResolvedGalleryUrls } from '../hooks/useResolvedGalleryUrls';
import { ENABLE_REAL_PROPERTY_GALLERY } from '../utils/propertyGalleryFlags';
import { GALLERY_SAFE_MODE } from '../utils/gallerySafeMode';
import { getVisibleWorkspaceModules } from '../../../common/utils/workspace';
import { propertyTypeValues } from '../../../common/utils/propertyTypes';
import { getSettingsCurrencyRates } from '../../../common/utils/fxRates';
import {
  appBorderClass,
  appButtonMutedClass,
  appOverlayClass,
  appPanelClass,
  appPanelHeroClass,
  appPanelInsetClass,
  appPanelSoftClass,
  appSelectClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
  chartDotRingClass,
  chartTooltipSurfaceClass,
} from '../styles/dashboardTheme';

interface PropertyCardProps {
  property: Property;
  mortgage?: Mortgage;
  onDelete: (id: string) => void;
  onEdit: (property: Property, section?: string | null) => void;
  onGenerateReport?: (property: Property) => void;
  activeTabOverride?: PropertyTab | null;
  onRequestTabChange?: (tab: PropertyTab) => void;
  tutorialTargetId?: string | null;
}

export type PropertyTab =
  | 'overview'
  | 'finances'
  | 'mortgage'
  | 'documents'
  | 'taxes'
  | 'notes'
  | 'gallery';

interface PropertyMetadataItem {
  key: string;
  icon: LucideIcon;
  value: string;
}

type PropertyDocumentCategoryKey =
  | 'legal'
  | 'mortgage'
  | 'rental'
  | 'expenses-tax'
  | 'insurance'
  | 'renovations'
  | 'other';

type PropertyDocumentStatus = 'uploaded' | 'missing' | 'upload-needed' | 'suggested';

interface PropertyDocumentCategoryMeta {
  key: PropertyDocumentCategoryKey;
  label: string;
}

interface PropertyDocumentListItem {
  id: string;
  name: string;
  category: PropertyDocumentCategoryKey;
  typeLabel: string;
  uploadedAt: string;
  sourceLabel: string;
  url?: string;
  status: PropertyDocumentStatus;
}

interface PropertyCriticalDocumentItem {
  id: string;
  name: string;
  category: PropertyDocumentCategoryKey;
  status: Exclude<PropertyDocumentStatus, 'suggested'>;
  supportingText: string;
}

const getFileNameFromUrl = (value: string, fallback: string) => {
  const cleanedValue = value.trim();

  if (!cleanedValue) {
    return fallback;
  }

  const normalized = cleanedValue.split('?')[0]?.split('#')[0] ?? cleanedValue;
  const fileName = normalized.split('/').pop() ?? normalized;

  return fileName || fallback;
};

const getDocumentTypeFromFileName = (fileName: string) => {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);

  if (!match) {
    return 'Reference';
  }

  return match[1].toUpperCase();
};

const getOccupancyBadgeClasses = (status: string) => {
  switch (status) {
    case 'occupied':
      return 'border border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'vacant':
      return 'border border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
    default:
      return 'border border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
  }
};

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  mortgage,
  onDelete,
  onEdit,
  onGenerateReport,
  activeTabOverride = null,
  onRequestTabChange,
  tutorialTargetId = null,
}) => {
  const { settings, t } = useSettings();
  const safeProperty = property ?? ({} as Property);
  const safeMortgage = mortgage ?? undefined;
  const fxRates = getSettingsCurrencyRates(settings);
  const isSpanish = settings.language === 'es';
  const languageDateLocale =
    settings.language === 'es' ? 'es-ES' : settings.language === 'pt' ? 'pt-PT' : 'en-US';
  const formatLanguageDate = (dateString: string) => {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return new Intl.DateTimeFormat(languageDateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };
  const visibleModules = useMemo(() => getVisibleWorkspaceModules(settings), [settings]);
  const canGenerateReport = Boolean(onGenerateReport) && visibleModules.includes('reports');
  const details = calculatePropertyDetails(safeProperty, safeMortgage);
  const taxRuntime = calculatePropertyTaxRuntime(safeProperty, details.annualNetCashflow);
  const activeLease = getActiveLease(safeProperty);
  const leaseHistory = activeLease ? calculateLeaseAdjustmentHistory(activeLease) : [];
  const nextLeaseUpdateDate = activeLease ? calculateLeaseNextUpdateDate(activeLease) : '';
  const rentRuleSummary = activeLease ? summarizeRentUpdateRule(activeLease.rentUpdateRule) : '';

  const galleryImageRefs = useMemo(() => {
    if (Array.isArray(safeProperty.imageUrls) && safeProperty.imageUrls.length > 0) {
      return normalizeGalleryUrls(safeProperty.imageUrls);
    }

    return normalizeGalleryUrls(safeProperty.imageUrl ? [safeProperty.imageUrl] : []);
  }, [safeProperty.imageUrl, safeProperty.imageUrls]);
  const galleryImages = useResolvedGalleryUrls(galleryImageRefs);
  const galleryThumbnailRefs = useMemo(
    () => normalizeGalleryUrls(safeProperty.imageThumbnailUrls ?? []),
    [safeProperty.imageThumbnailUrls]
  );
  const galleryThumbnailImages = useResolvedGalleryUrls(galleryThumbnailRefs);
  useEffect(() => {
    if (!ENABLE_REAL_PROPERTY_GALLERY && galleryImages.length > 0) {
      console.debug('[property-gallery] real gallery disabled, using safe placeholder', {
        imageCount: galleryImages.length,
      });
    }
  }, [galleryImages.length]);

  const [selectedImageIndex, setSelectedImageIndex] = useState(
    Math.min(safeProperty.primaryImageIndex ?? 0, Math.max(galleryImages.length - 1, 0))
  );
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PropertyTab>('overview');
  const [selectedDocumentCategory, setSelectedDocumentCategory] = useState<
    'all' | PropertyDocumentCategoryKey
  >('all');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const operatingCurrency = safeProperty.operatingCurrency ?? safeProperty.currency ?? 'EUR';
  const propertyValueCurrency =
    safeProperty.propertyValueCurrency ??
    safeProperty.currentEstimatedValueCurrency ??
    safeProperty.purchasePriceCurrency ??
    operatingCurrency;
  const purchasePriceCurrency = safeProperty.purchasePriceCurrency ?? propertyValueCurrency;
  const currentEstimatedValueCurrency =
    safeProperty.currentEstimatedValueCurrency ?? propertyValueCurrency;
  const rentCurrency =
    activeLease?.monthlyRentCurrency ?? safeProperty.monthlyRentCurrency ?? operatingCurrency;
  const depositCurrency =
    activeLease?.securityDepositCurrency ??
    safeProperty.rentalDepositCurrency ??
    rentCurrency;
  const lateFeeCurrency =
    activeLease?.lateFeeCurrency ?? safeProperty.lateFeeCurrency ?? rentCurrency;
  const mortgageDisplayCurrency = safeMortgage?.currency ?? operatingCurrency;
  const totalCost = safeProperty.totalInitialInvestment || safeProperty.totalPurchaseCost;
  const ownMoney =
    safeProperty.totalCashInvestedForPurchase || safeProperty.cashInvested || details.investedCapital;
  const setupCosts = Math.max(
    totalCost - convertCurrency(safeProperty.purchasePrice, purchasePriceCurrency, operatingCurrency),
    0
  );
  const formatOperatingAmount = (value: number, sourceCurrency: typeof operatingCurrency = operatingCurrency) =>
    formatPortfolioDisplayCurrency(value, sourceCurrency, 'operating', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });
  const formatValuationAmount = (
    value: number,
    sourceCurrency: typeof propertyValueCurrency = propertyValueCurrency
  ) =>
    formatPortfolioDisplayCurrency(value, sourceCurrency, 'valuation', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });
  const formatPerSquareMeterAmount = (
    value: number,
    sourceCurrency: typeof propertyValueCurrency = propertyValueCurrency
  ) =>
    formatPortfolioDisplayCurrency(value, sourceCurrency, 'valuation', {
      reportingCurrency: settings.currency,
      rateOverrides: fxRates,
    });
  const formatMortgageBalanceAmount = (value: number) =>
    formatPortfolioDisplayCurrency(
      convertCurrency(value, operatingCurrency, mortgageDisplayCurrency),
      mortgageDisplayCurrency,
      'valuation',
      {
        reportingCurrency: settings.currency,
        rateOverrides: fxRates,
      }
    );
  const formatMortgageOperatingAmount = (value: number | null) =>
    value === null
      ? t('common.notSpecified')
      : formatPortfolioDisplayCurrency(
          convertCurrency(value, operatingCurrency, mortgageDisplayCurrency),
          mortgageDisplayCurrency,
          'operating',
          {
            reportingCurrency: settings.currency,
            rateOverrides: fxRates,
          }
        );

  const panelClass = `${appPanelClass} overflow-hidden rounded-[22px]`;
  const nestedPanelClass = `${appPanelSoftClass} rounded-[18px] shadow-[0_10px_18px_-24px_rgba(15,23,42,0.08)] dark:shadow-[0_14px_26px_-30px_rgba(2,6,23,0.54)]`;
  const insetPanelClass = `${appPanelInsetClass} rounded-[18px]`;
  const sectionTitleClass = `text-[11px] font-semibold tracking-[-0.01em] ${appTextStrongClass}`;
  const labelClass = `text-[10px] font-medium ${appTextSoftClass}`;
  const valueClass = `mt-0.5 text-[0.96rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`;
  const sectionEditButtonClass = `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${appButtonMutedClass} ${appTextMutedClass} shadow-none hover:border-slate-300/60 hover:text-slate-700 dark:hover:border-cyan-400/18 dark:hover:text-cyan-300`;
  const cardPaddingClass = 'p-3.5 sm:p-4';
  const successValueClass = 'text-emerald-700 dark:text-emerald-300';
  const warningValueClass = 'text-amber-700 dark:text-amber-300';
  const infoValueClass = 'text-teal-700 dark:text-teal-300';
  const accentValueClass = 'text-cyan-700 dark:text-cyan-300';
  const dangerValueClass = 'text-rose-700 dark:text-rose-300';
  const taxBadgeToneClasses = {
    neutral: `${appPanelInsetClass} ${appTextMutedClass}`,
    info: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
    success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  } as const;
  const renderSectionHeader = (
    title: string,
    section: string,
    subtitle?: string,
    editable = true
  ) => (
    <div className="flex items-start justify-between gap-2.5">
      <div>
        <h4 className={sectionTitleClass}>{title}</h4>
        {subtitle ? <p className={`mt-0.5 text-[12px] leading-4.5 ${appTextMutedClass}`}>{subtitle}</p> : null}
      </div>
      {editable ? (
        <button
          type="button"
          onClick={() => onEdit(property, section)}
          className={sectionEditButtonClass}
          title={t('common.edit')}
        >
          <Edit className="h-3.5 w-3.5" />
          <span className="sr-only">{t('common.edit')}</span>
        </button>
      ) : null}
    </div>
  );

  useEffect(() => {
    if (GALLERY_SAFE_MODE) {
      return;
    }
    if (galleryImages.length === 0) {
      setSelectedImageIndex(0);
      return;
    }

    const nextIndex = Math.min(safeProperty.primaryImageIndex ?? 0, Math.max(galleryImages.length - 1, 0));
    if (nextIndex !== (selectedImageIndex ?? 0) && typeof console !== 'undefined' && nextIndex >= galleryImages.length) {
      console.debug('[property-gallery] invalid selected image index', {
        index: nextIndex,
        length: galleryImages.length,
      });
    }
    setSelectedImageIndex(nextIndex);
  }, [galleryImages, safeProperty.primaryImageIndex, safeProperty.id]);

  useEffect(() => {
    setActiveTab('overview');
  }, [safeProperty.id]);

  useEffect(() => {
    setSelectedDocumentCategory('all');
  }, [safeProperty.id]);

  useEffect(() => {
    if (activeTabOverride) {
      setActiveTab(activeTabOverride);
    }
  }, [activeTabOverride]);

  const documentCategoryMeta = useMemo<PropertyDocumentCategoryMeta[]>(
    () => [
      { key: 'legal', label: isSpanish ? 'Legal' : 'Legal' },
      { key: 'mortgage', label: isSpanish ? 'Hipoteca' : 'Mortgage' },
      { key: 'rental', label: isSpanish ? 'Alquiler' : 'Rental' },
      { key: 'expenses-tax', label: isSpanish ? 'Gastos e impuestos' : 'Expenses & Tax' },
      { key: 'insurance', label: isSpanish ? 'Seguros' : 'Insurance' },
      { key: 'renovations', label: isSpanish ? 'Reformas' : 'Renovations' },
      { key: 'other', label: isSpanish ? 'Otros' : 'Other' },
    ],
    [isSpanish]
  );

  const formatDocumentDate = (dateString: string) => {
    if (!dateString) {
      return isSpanish ? 'Sin fecha' : 'No date';
    }

    const parsedDate = new Date(dateString);

    if (Number.isNaN(parsedDate.getTime())) {
      return dateString;
    }

    return new Intl.DateTimeFormat(languageDateLocale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsedDate);
  };

  const formatRelativeUpload = (dateString: string) => {
    if (!dateString) {
      return isSpanish ? 'Sin cargas todavia' : 'No uploads yet';
    }

    const parsedDate = new Date(dateString);

    if (Number.isNaN(parsedDate.getTime())) {
      return isSpanish ? 'Fecha no disponible' : 'Date unavailable';
    }

    const diffMs = Date.now() - parsedDate.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    if (diffDays === 0) {
      return isSpanish ? 'Hoy' : 'Today';
    }

    if (diffDays === 1) {
      return isSpanish ? 'Hace 1 dia' : '1 day ago';
    }

    return isSpanish ? `Hace ${diffDays} dias` : `${diffDays} days ago`;
  };

  const {
    uploadedDocuments,
    criticalDocuments,
    suggestedDocuments,
    allDocumentRows,
    documentCountsByCategory,
    lastUploadedAt,
  } = useMemo(() => {
    const uploadedRows: PropertyDocumentListItem[] = [];
    const criticalRows: PropertyCriticalDocumentItem[] = [];
    const suggestedRows: PropertyDocumentListItem[] = [];
    const allRows: PropertyDocumentListItem[] = [];
    const counts: Record<PropertyDocumentCategoryKey, number> = {
      legal: 0,
      mortgage: 0,
      rental: 0,
      'expenses-tax': 0,
      insurance: 0,
      renovations: 0,
      other: 0,
    };
    const registeredNames = new Set<string>();

    const registerUploadedDocument = (
      item: Omit<PropertyDocumentListItem, 'status'> & { status?: PropertyDocumentStatus }
    ) => {
      const normalizedName = item.name.trim().toLowerCase();

      if (registeredNames.has(normalizedName)) {
        return;
      }

      registeredNames.add(normalizedName);
      const nextRow: PropertyDocumentListItem = {
        ...item,
        status: item.status ?? 'uploaded',
      };

      uploadedRows.push(nextRow);
      allRows.push(nextRow);
      counts[nextRow.category] += 1;
    };

    const expenseCategoryForType = (expenseType: string): PropertyDocumentCategoryKey => {
      if (expenseType === 'property-tax') {
        return 'expenses-tax';
      }

      if (
        expenseType === 'home-insurance' ||
        expenseType === 'life-insurance' ||
        expenseType === 'rent-default-insurance'
      ) {
        return 'insurance';
      }

      return 'expenses-tax';
    };

    (property.recurringExpenses ?? []).forEach((expense) => {
      const baseCategory = expenseCategoryForType(expense.expenseType);
      const fallbackName = `${expense.label || 'Property'} ${baseCategory === 'insurance' ? 'policy' : 'record'}`;

      if (expense.documentUrl?.trim()) {
        const fileName = getFileNameFromUrl(expense.documentUrl, fallbackName);
        registerUploadedDocument({
          id: `expense-${expense.id}`,
          name: fileName,
          category: baseCategory,
          typeLabel: getDocumentTypeFromFileName(fileName),
          uploadedAt: expense.lastPaymentDate || expense.nextExpectedUpdateDate || '',
          sourceLabel: expense.label,
          url: expense.documentUrl,
        });
      }

      expense.paymentHistory.forEach((payment) => {
        if (!payment.attachedDocumentUrl?.trim()) {
          return;
        }

        const fileName = getFileNameFromUrl(
          payment.attachedDocumentUrl,
          `${expense.label || 'Expense'} receipt`
        );

        registerUploadedDocument({
          id: `expense-payment-${expense.id}-${payment.id}`,
          name: fileName,
          category: baseCategory,
          typeLabel: getDocumentTypeFromFileName(fileName),
          uploadedAt: payment.paymentDate || expense.lastPaymentDate || '',
          sourceLabel: payment.coveredPeriod || expense.label,
          url: payment.attachedDocumentUrl,
        });
      });
    });

    const hasRentalContext =
      Boolean(activeLease) ||
      property.occupancyStatus === 'occupied' ||
      Boolean(property.leaseType?.trim()) ||
      Boolean(property.leaseEndDate?.trim());
    const hasMortgageContext =
      Boolean(mortgage) || property.hasMortgage || property.currentMortgageBalance > 0;
    const hasInsuranceContext =
      (property.annualHomeInsurance ?? 0) > 0 ||
      (property.annualLifeInsurance ?? 0) > 0 ||
      (property.annualRentDefaultInsurance ?? 0) > 0 ||
      (property.recurringExpenses ?? []).some((expense) =>
        ['home-insurance', 'life-insurance', 'rent-default-insurance'].includes(expense.expenseType)
      );
    const hasTaxContext =
      (property.annualIBI ?? 0) > 0 ||
      (property.ibiAndLocalTaxesAnnual ?? 0) > 0 ||
      (property.recurringExpenses ?? []).some((expense) => expense.expenseType === 'property-tax');
    const hasRenovationContext =
      (property.renovationCosts ?? 0) > 0 ||
      property.renovationConservation > 0 ||
      property.renovationImprovements > 0 ||
      property.renovatedYear != null;

    criticalRows.push({
      id: 'critical-purchase-deed',
      name: isSpanish ? 'Escritura de compraventa' : 'Purchase deed',
      category: 'legal',
      status: 'upload-needed',
      supportingText: property.purchaseDate
        ? formatLanguageDate(property.purchaseDate)
        : isSpanish
        ? 'Documento base de titularidad'
        : 'Primary ownership record',
    });

    if (hasMortgageContext) {
      criticalRows.push({
        id: 'critical-mortgage',
        name: isSpanish ? 'Acuerdo hipotecario' : 'Mortgage agreement',
        category: 'mortgage',
        status: 'upload-needed',
        supportingText:
          mortgage?.lenderName ||
          property.lenderName ||
          (isSpanish ? 'Financiacion activa' : 'Financing active'),
      });
    }

    if (hasRentalContext) {
      criticalRows.push({
        id: 'critical-rental',
        name: isSpanish ? 'Contrato de alquiler' : 'Rental agreement',
        category: 'rental',
        status: 'upload-needed',
        supportingText:
          activeLease?.endDate || property.leaseEndDate
            ? formatLanguageDate(activeLease?.endDate ?? property.leaseEndDate ?? '')
            : property.leaseType || (isSpanish ? 'Tenencia activa' : 'Active tenancy'),
      });
    }

    if (hasInsuranceContext) {
      criticalRows.push({
        id: 'critical-insurance',
        name: isSpanish ? 'Poliza de seguro' : 'Insurance policy',
        category: 'insurance',
        status: uploadedRows.some((item) => item.category === 'insurance') ? 'uploaded' : 'upload-needed',
        supportingText: isSpanish ? 'Cobertura del inmueble' : 'Property coverage record',
      });
    }

    if (hasTaxContext) {
      criticalRows.push({
        id: 'critical-tax',
        name: isSpanish ? 'Recibo fiscal' : 'Tax receipt',
        category: 'expenses-tax',
        status: uploadedRows.some((item) => item.category === 'expenses-tax') ? 'uploaded' : 'upload-needed',
        supportingText: isSpanish ? 'Impuestos y tasas del inmueble' : 'Property tax and local charges',
      });
    }

    const suggestionCandidates: Array<{
      id: string;
      name: string;
      category: PropertyDocumentCategoryKey;
      typeLabel: string;
      supportingText: string;
    }> = [
      {
        id: 'suggested-purchase-deed',
        name: isSpanish ? 'Escritura de compraventa' : 'Purchase deed',
        category: 'legal',
        typeLabel: isSpanish ? 'Documento legal' : 'Legal record',
        supportingText: isSpanish ? 'Titularidad y adquisicion' : 'Ownership and acquisition',
      },
      ...(hasInsuranceContext
        ? [
            {
              id: 'suggested-insurance-policy',
              name: isSpanish ? 'Poliza de seguro' : 'Insurance policy',
              category: 'insurance' as const,
              typeLabel: isSpanish ? 'Poliza' : 'Policy',
              supportingText: isSpanish ? 'Cobertura principal' : 'Primary coverage',
            },
          ]
        : []),
      ...(hasTaxContext
        ? [
            {
              id: 'suggested-tax-receipt',
              name: isSpanish ? 'Recibo fiscal' : 'Tax receipt',
              category: 'expenses-tax' as const,
              typeLabel: isSpanish ? 'Recibo' : 'Receipt',
              supportingText: isSpanish ? 'IBI y tasas locales' : 'IBI and local taxes',
            },
          ]
        : []),
      ...(hasMortgageContext
        ? [
            {
              id: 'suggested-mortgage-deed',
              name: isSpanish ? 'Escritura hipotecaria' : 'Mortgage deed',
              category: 'mortgage' as const,
              typeLabel: isSpanish ? 'Financiacion' : 'Financing',
              supportingText:
                mortgage?.lenderName ||
                property.lenderName ||
                (isSpanish ? 'Hipoteca activa' : 'Active mortgage'),
            },
          ]
        : []),
      ...(hasRentalContext
        ? [
            {
              id: 'suggested-rental-agreement',
              name: isSpanish ? 'Contrato de alquiler' : 'Rental agreement',
              category: 'rental' as const,
              typeLabel: isSpanish ? 'Arrendamiento' : 'Lease',
              supportingText: property.leaseType || (isSpanish ? 'Contexto de alquiler' : 'Rental context'),
            },
          ]
        : []),
      ...(hasRenovationContext
        ? [
            {
              id: 'suggested-renovation-file',
              name: isSpanish ? 'Archivo de reforma' : 'Renovation file',
              category: 'renovations' as const,
              typeLabel: isSpanish ? 'Proyecto' : 'Project',
              supportingText: isSpanish ? 'Facturas y alcance de obra' : 'Invoices and scope of work',
            },
          ]
        : []),
    ];

    suggestionCandidates.forEach((candidate) => {
      if (registeredNames.has(candidate.name.toLowerCase())) {
        return;
      }

      const row: PropertyDocumentListItem = {
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        typeLabel: candidate.typeLabel,
        uploadedAt: '',
        sourceLabel: candidate.supportingText,
        status: 'suggested',
      };

      suggestedRows.push(row);
      allRows.push(row);
    });

    allRows.sort((left, right) => {
      if (left.status === 'uploaded' && right.status !== 'uploaded') {
        return -1;
      }

      if (left.status !== 'uploaded' && right.status === 'uploaded') {
        return 1;
      }

      if (left.uploadedAt && right.uploadedAt) {
        return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
      }

      if (left.uploadedAt) {
        return -1;
      }

      if (right.uploadedAt) {
        return 1;
      }

      return left.name.localeCompare(right.name);
    });

    const sortedUploads = [...uploadedRows].sort(
      (left, right) => new Date(right.uploadedAt || 0).getTime() - new Date(left.uploadedAt || 0).getTime()
    );

    return {
      uploadedDocuments: sortedUploads,
      criticalDocuments: criticalRows,
      suggestedDocuments: suggestedRows,
      allDocumentRows: allRows,
      documentCountsByCategory: counts,
      lastUploadedAt: sortedUploads.find((item) => item.uploadedAt)?.uploadedAt ?? '',
    };
  }, [activeLease, isSpanish, languageDateLocale, mortgage, property]);

  const filteredDocumentRows =
    selectedDocumentCategory === 'all'
      ? allDocumentRows
      : allDocumentRows.filter((item) => item.category === selectedDocumentCategory);
  const filteredDocumentsCount = filteredDocumentRows.length;
  const categoriesUsedCount = Object.values(documentCountsByCategory).filter((count) => count > 0).length;
  const missingCriticalDocumentsCount = criticalDocuments.filter(
    (item) => item.status !== 'uploaded'
  ).length;

  const occupancyLabel =
    property.occupancyStatus === 'occupied'
      ? t('properties.status.occupied')
      : property.occupancyStatus === 'vacant'
      ? t('properties.status.vacant')
      : t('properties.status.tbc');
  const localizedPropertyType =
    property.propertyType && propertyTypeValues.includes(property.propertyType as (typeof propertyTypeValues)[number])
      ? t(`properties.form.propertyTypeOptions.${property.propertyType}`)
      : property.propertyType;
  const localizedCountry =
    property.country === 'Spain'
      ? t('properties.form.countryOptions.spain')
      : property.country;
  const currencyContextLabel =
    settings.currency === 'ARS'
      ? isSpanish
        ? 'Patrimonio en USD · Operación en ARS'
        : 'Wealth in USD · Operations in ARS'
      : propertyValueCurrency === operatingCurrency
      ? `Valor y operación en ${propertyValueCurrency}`
      : `Valor base en ${propertyValueCurrency} · Operación en ${operatingCurrency}`;

  const pieData = [
    {
      name: t('properties.form.monthlyOperatingExpenses'),
      value: details.monthlyOperatingExpenses,
      color: '#f59e0b',
    },
    {
      name: t('properties.form.monthlyInsuranceCost'),
      value: details.monthlyInsuranceExpenses,
      color: '#0f766e',
    },
    {
      name: t('mortgages.card.monthlyPayment'),
      value: details.monthlyMortgagePayment,
      color: '#1e293b',
    },
    {
      name: t('properties.labels.netCashFlow'),
      value: Math.max(details.netMonthlyCashflow, 0),
      color: '#10b981',
    },
  ];

  const annualValueCreation =
    (details.annualPrincipalAmortized ?? 0) +
    details.annualNetCashflow +
    details.appreciationAmount;
  const totalOperatingAndInsurance =
    details.monthlyOperatingExpenses + details.monthlyInsuranceExpenses;
  const financeKpis: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    tone: 'success' | 'info' | 'warning';
    emphasis?: 'primary';
  }> = [
    {
      label: t('properties.form.netMonthlyCashflow'),
      value: formatOperatingAmount(details.netMonthlyCashflow),
      icon: Wallet2,
      tone: details.netMonthlyCashflow >= 0 ? 'success' : 'warning',
      emphasis: 'primary',
    },
    {
      label: t('properties.labels.netYield'),
      value: formatPercentage(details.netYield),
      icon: CircleDollarSign,
      tone: 'success',
    },
    {
      label: 'ROCE',
      value: formatPercentage(details.roce),
      icon: TrendingUp,
      tone: 'info',
    },
    {
      label: t('dashboard.annualValueCreation'),
      value: formatValuationAmount(annualValueCreation),
      icon: Banknote,
      tone: 'warning',
    },
  ];
  const breakdownCards = [
    {
      label: t('properties.labels.monthlyRent'),
      value: formatOperatingAmount(details.monthlyRent),
      percentage:
        details.monthlyRent > 0 ? formatPercentage(100, 1) : formatPercentage(0, 1),
      amountShare:
        details.monthlyRent > 0
          ? formatPercentage((details.monthlyRent / Math.max(details.monthlyRent + totalOperatingAndInsurance + details.monthlyMortgagePayment, 1)) * 100, 0)
          : formatPercentage(0, 0),
      color: '#10b981',
      surface: '#f8fffb',
      border: '#dcefe5',
      valueClass: successValueClass,
      emphasis: 'major' as const,
    },
    {
      label: t('properties.form.monthlyOperatingExpenses'),
      value: formatOperatingAmount(details.monthlyOperatingExpenses),
      percentage:
        details.monthlyRent > 0
          ? formatPercentage((details.monthlyOperatingExpenses / details.monthlyRent) * 100, 1)
          : formatPercentage(0, 1),
      amountShare:
        details.totalMonthlyExpenses > 0
          ? formatPercentage((details.monthlyOperatingExpenses / details.totalMonthlyExpenses) * 100, 0)
          : formatPercentage(0, 0),
      color: '#f59e0b',
      surface: '#fffdf7',
      border: '#f1e6c9',
      valueClass: warningValueClass,
      emphasis: 'minor' as const,
    },
    {
      label: t('properties.form.monthlyInsuranceCost'),
      value: formatOperatingAmount(details.monthlyInsuranceExpenses),
      percentage:
        details.monthlyRent > 0
          ? formatPercentage((details.monthlyInsuranceExpenses / details.monthlyRent) * 100, 1)
          : formatPercentage(0, 1),
      amountShare:
        details.totalMonthlyExpenses > 0
          ? formatPercentage((details.monthlyInsuranceExpenses / details.totalMonthlyExpenses) * 100, 0)
          : formatPercentage(0, 0),
      color: '#36506b',
      surface: '#fbfcfd',
      border: '#e3e9ee',
      valueClass: infoValueClass,
      emphasis: 'minor' as const,
    },
    {
      label: t('mortgages.card.monthlyPayment'),
      value: formatOperatingAmount(details.monthlyMortgagePayment),
      percentage:
        details.monthlyRent > 0
          ? formatPercentage((details.monthlyMortgagePayment / details.monthlyRent) * 100, 1)
          : formatPercentage(0, 1),
      amountShare:
        details.totalMonthlyExpenses > 0
          ? formatPercentage((details.monthlyMortgagePayment / details.totalMonthlyExpenses) * 100, 0)
          : formatPercentage(0, 0),
      color: '#1e293b',
      surface: '#fcfcfd',
      border: '#e6e8ec',
      valueClass: appTextStrongClass,
      emphasis: 'strongOutflow' as const,
    },
    {
      label: t('properties.form.netMonthlyCashflow'),
      value: formatOperatingAmount(details.netMonthlyCashflow),
      percentage:
        details.monthlyRent > 0
          ? formatPercentage((details.netMonthlyCashflow / details.monthlyRent) * 100, 1)
          : formatPercentage(0, 1),
      amountShare:
        details.monthlyRent > 0
          ? formatPercentage((Math.abs(details.netMonthlyCashflow) / details.monthlyRent) * 100, 0)
          : formatPercentage(0, 0),
      color: details.netMonthlyCashflow >= 0 ? '#0f766e' : '#e11d48',
      surface: details.netMonthlyCashflow >= 0 ? '#f8fffb' : '#fff8f8',
      border: details.netMonthlyCashflow >= 0 ? '#dbeee6' : '#f5dfe3',
      valueClass: details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass,
      emphasis: 'major' as const,
    },
  ];
  const snapshotRows = [
    {
      label: isSpanish ? 'Monthly Income' : 'Monthly Income',
      value: formatOperatingAmount(details.monthlyRent),
      valueClass: successValueClass,
    },
    {
      label: isSpanish ? 'Operating + Insurance' : 'Operating + Insurance',
      value: formatOperatingAmount(totalOperatingAndInsurance),
      valueClass: appTextStrongClass,
    },
    {
      label: isSpanish ? 'Mortgage Payment' : 'Mortgage Payment',
      value: formatOperatingAmount(details.monthlyMortgagePayment),
      valueClass: appTextStrongClass,
    },
    {
      label: 'Cashflow after taxes',
      value:
        taxRuntime.generic.estimatedTax > 0
          ? formatOperatingAmount(details.netMonthlyCashflow - taxRuntime.generic.estimatedTax / 12)
          : '—',
      valueClass:
        taxRuntime.generic.estimatedTax > 0
          ? details.netMonthlyCashflow - taxRuntime.generic.estimatedTax / 12 >= 0
            ? successValueClass
            : dangerValueClass
          : appTextMutedClass,
      helperText:
        taxRuntime.generic.estimatedTax > 0
          ? `Estimated tax: ${formatOperatingAmount(taxRuntime.generic.estimatedTax / 12)}`
          : 'Set tax assumptions',
      helperTextClass: taxRuntime.generic.estimatedTax > 0 ? appTextSoftClass : appTextMutedClass,
      emphasize: true,
    },
  ];
  const cashflowAfterTaxesRow = snapshotRows[snapshotRows.length - 1];
  const investmentSummaryRows = [
    {
      label: t('properties.form.purchasePrice'),
      value: formatValuationAmount(property.purchasePrice, purchasePriceCurrency),
      valueClass: appTextStrongClass,
    },
    {
      label: t('properties.labels.ownMoney'),
      value: formatValuationAmount(ownMoney),
      valueClass: appTextStrongClass,
    },
    {
      label: t('properties.labels.setupCosts'),
      value: formatValuationAmount(setupCosts),
      valueClass: appTextStrongClass,
    },
    {
      label: t('properties.labels.totalCost'),
      value: formatValuationAmount(totalCost),
      valueClass: successValueClass,
      emphasize: true,
    },
  ];
  const returnMetricRows = [
    {
      label: t('properties.labels.grossYield'),
      value: formatPercentage(details.grossYield),
      icon: Coins,
      valueClass: appTextStrongClass,
    },
    {
      label: t('properties.labels.netYield'),
      value: formatPercentage(details.netYield),
      icon: CircleDollarSign,
      valueClass: successValueClass,
    },
    {
      label: 'ROCE',
      value: formatPercentage(details.roce),
      icon: TrendingUp,
      valueClass: accentValueClass,
    },
    {
      label: t('properties.labels.appreciation'),
      value: formatPercentage(details.appreciationPercentage),
      icon: ArrowDownUp,
      valueClass: appTextStrongClass,
    },
  ];
  const propertyEngineRows = [
    {
      label: t('dashboard.annualPrincipalPaydown'),
      value: formatMortgageOperatingAmount(details.annualPrincipalAmortized),
    },
    {
      label: t('dashboard.projectedAppreciation'),
      value: formatValuationAmount(details.appreciationAmount),
    },
    {
      label: t('dashboard.annualCashflowMetric'),
      value: formatOperatingAmount(details.annualNetCashflow),
    },
  ];
  const operatingExpenseRows = [
    {
      label: t('properties.form.propertyManagement'),
      value: formatOperatingAmount(details.annualManagementFees),
    },
    {
      label: t('properties.form.annualCommunityFees'),
      value: formatOperatingAmount(details.annualCommunityFees),
    },
    {
      label: t('properties.form.annualIBI'),
      value: formatOperatingAmount(details.annualIbi),
    },
  ];
  const insuranceRows = [
    {
      label: t('properties.form.annualHomeInsurance'),
      value: formatOperatingAmount(details.annualHomeInsurance),
    },
    {
      label: t('properties.form.annualRentDefaultInsurance'),
      value: formatOperatingAmount(details.annualRentDefaultInsurance),
    },
    {
      label: t('properties.form.annualLifeInsurance'),
      value: formatOperatingAmount(details.annualLifeInsurance),
    },
  ];

  const heroMetrics = [
    {
      label: t('properties.labels.estimatedValue'),
      value: formatValuationAmount(property.currentEstimatedValue, currentEstimatedValueCurrency),
      tone: appTextStrongClass,
    },
    {
      label: t('properties.labels.monthlyRent'),
      value: formatOperatingAmount(details.monthlyRent),
      tone: successValueClass,
    },
    {
      label: t('properties.form.netMonthlyCashflow'),
      value: formatOperatingAmount(details.netMonthlyCashflow),
      tone: details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass,
    },
    {
      label: t('mortgages.card.currentBalance'),
      value: formatMortgageBalanceAmount(details.currentMortgageBalance),
      tone: appTextStrongClass,
    },
  ];
  const operatingSummaryMetrics = [
    {
      label: t('properties.labels.monthlyRent'),
      value: formatOperatingAmount(details.monthlyRent),
      tone: successValueClass,
    },
    {
      label: t('properties.labels.totalExpenses'),
      value: formatOperatingAmount(details.totalMonthlyExpenses),
      tone: warningValueClass,
    },
    {
      label: t('properties.form.netMonthlyCashflow'),
      value: formatOperatingAmount(details.netMonthlyCashflow),
      tone: details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass,
    },
  ];
  const patrimonySummaryMetrics = [
    {
      label: t('mortgages.card.currentBalance'),
      value: formatMortgageBalanceAmount(details.currentMortgageBalance),
      tone: appTextStrongClass,
    },
    {
      label: 'ROCE',
      value: formatPercentage(details.roce),
      tone: accentValueClass,
    },
  ];
  const galleryEmptyTitle = isSpanish ? 'Todavía no hay imágenes cargadas' : 'No images uploaded yet';
  const galleryEmptyBody = isSpanish
    ? 'Añade fotos para completar la vista de la propiedad.'
    : 'Add photos to complete the property view.';
  const mortgageEmptyTitle = isSpanish ? 'No hay hipoteca vinculada' : 'No mortgage linked';
  const mortgageEmptyBody = isSpanish
    ? 'Puedes añadirla más adelante si la propiedad tiene financiación.'
    : 'You can add it later if the property has financing.';
  const mortgageRateValue: number | null =
    (mortgage
      ? [
          calculateCurrentRate(mortgage),
          mortgage.currentInterestRate,
          mortgage.interestRate,
          mortgage.baseInterestRate,
          mortgage.initialInterestRate,
        ].find((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : property.initialInterestRateYear1 > 0
      ? property.initialInterestRateYear1
      : null) ?? null;
  const mortgageRemainingMonths = mortgage ? calculateRemainingMortgageMonths(mortgage) : 0;
  const mortgageRemainingTermLabel =
    mortgage && mortgageRemainingMonths > 0
      ? formatMortgageTermMonths(mortgageRemainingMonths)
      : mortgage?.mortgageTermMonths
      ? formatMortgageTermMonths(mortgage.mortgageTermMonths)
      : property.mortgageTermYears
      ? formatMortgageTermYears(property.mortgageTermYears)
      : t('common.notSpecified');
  const mortgageLenderLabel = mortgage?.lenderName || property.lenderName || t('common.notSpecified');
  const mortgageRateTypeLabel = mortgage
    ? mortgage.fixedOrVariable === 'variable'
      ? t('properties.mortgageImpact.variableRate')
      : t('properties.mortgageImpact.fixedRate')
    : t('common.notSpecified');
  const mortgageTypeLabel = mortgage?.mortgageType?.trim() || mortgageRateTypeLabel;
  const mortgageRentBurdenLabel =
    details.monthlyRent > 0 && details.monthlyMortgagePayment > 0
      ? t('properties.mortgageImpact.rentBurden', {
          percentage: formatPercentage(details.mortgagePercentageOfRent, 0),
        })
      : t('properties.mortgageImpact.rentBurdenUnavailable');
  const mortgageProfileLabel = mortgage
    ? mortgage.fixedOrVariable === 'variable'
      ? t('properties.mortgageImpact.profileVariable', {
          term: mortgageRemainingTermLabel,
        })
      : t('properties.mortgageImpact.profileFixed', {
          term: mortgageRemainingTermLabel,
        })
    : t('properties.mortgageImpact.profileFallback');
  const taxSummaryLabels = {
    taxTitle: isSpanish ? 'Fiscalidad' : 'Tax',
    taxSubtitle: isSpanish
      ? 'Entiende tu posicion fiscal y el cashflow despues de impuestos de esta propiedad.'
      : 'Understand your tax position and after-tax cashflow for this property.',
    personalTaxProfile: isSpanish ? 'Perfil fiscal personal' : 'Personal Tax Profile',
    personalTaxProfileHelp: isSpanish
      ? 'Supuestos contextuales usados para calcular este resumen fiscal.'
      : 'Contextual assumptions used to calculate this tax summary.',
    editAssumptions: isSpanish ? 'Editar supuestos' : 'Edit assumptions',
    filingMode: isSpanish ? 'Modo de declaracion' : 'Filing mode',
    taxResidency: isSpanish ? 'Residencia fiscal' : 'Tax residency',
    country: isSpanish ? 'Pais' : 'Country',
    taxResultFlow: isSpanish ? 'Flujo del resultado fiscal' : 'Tax result flow',
    taxResultFlowHelp: isSpanish
      ? 'De ingresos brutos a cashflow neto despues de impuestos.'
      : 'From gross rental income to after-tax cashflow.',
    annualAmount: isSpanish ? 'Importe anual' : 'Annual amount',
    totalDeductibleExpenses: isSpanish ? 'Total gastos deducibles' : 'Total deductible expenses',
    assumptionsPanel: isSpanish ? 'Supuestos fiscales' : 'Tax assumptions',
    assumptionsPanelHelp: isSpanish
      ? 'Resumen practico de reglas, alcance y advertencias.'
      : 'Practical summary of rules, scope, and guardrails.',
    practicalNotes: isSpanish ? 'Notas practicas' : 'Practical notes',
    noValue: isSpanish ? 'No especificado' : 'Not specified',
    grossRentalIncome: isSpanish ? 'Ingreso bruto por alquiler' : 'Gross rental income',
    deductibleExpenses: isSpanish ? 'Gastos deducibles' : 'Deductible expenses',
    nonDeductibleExpenses: isSpanish ? 'Gastos no deducibles' : 'Non-deductible expenses',
    netIncomeBeforeTax: isSpanish ? 'Ingreso neto antes de impuestos' : 'Net income before tax',
    estimatedTax: isSpanish ? 'Impuesto estimado' : 'Estimated tax',
    annualAfterTaxCashflow: isSpanish ? 'Cashflow anual después de impuestos' : 'Annual after-tax cashflow',
    monthlyAfterTaxCashflow: isSpanish ? 'Cashflow mensual después de impuestos' : 'Monthly after-tax cashflow',
    ownershipPercentage: isSpanish ? 'Porcentaje de titularidad' : 'Ownership percentage',
    taxYear: isSpanish ? 'Año fiscal' : 'Tax year',
    taxModule: isSpanish ? 'Módulo fiscal' : 'Tax module',
    deductibleExpensesTitle: isSpanish ? 'Gastos deducibles' : 'Deductible expenses',
    deductibleExpensesHelp: isSpanish
      ? 'Categorías comunes reutilizadas entre módulos fiscales.'
      : 'Country-neutral categories reused across tax modules.',
    notesAndDisclaimers: isSpanish ? 'Notas y aclaraciones' : 'Notes & disclaimers',
    spainTaxRules: isSpanish ? 'Reglas fiscales de España' : 'Spain tax rules',
    spainTaxRulesHelp: isSpanish
      ? 'Se carga solo para propiedades en España.'
      : 'Loaded only for properties in Spain.',
    ownerType: isSpanish ? 'Tipo de titular' : 'Owner type',
    rentalType: isSpanish ? 'Tipo de alquiler' : 'Rental type',
    autonomousCommunity: isSpanish ? 'Comunidad autónoma' : 'Autonomous community',
    reductionRate: isSpanish ? 'Reducción aplicable' : 'Reduction rate',
    estimatedMarginalRate: isSpanish
      ? 'Tipo marginal estimado de IRPF'
      : 'Estimated personal marginal IRPF rate',
    taxableIncomeAfterReduction: isSpanish
      ? 'Base imponible tras reducción de vivienda'
      : 'Taxable income after housing reduction',
    spainDeductibleLabels: isSpanish ? 'Etiquetas deducibles en España' : 'Spain-specific deductible labels',
    howSpainWorks: isSpanish ? 'Cómo funciona en España' : 'How this works in Spain',
    oneTimeLeasing: isSpanish ? 'Coste puntual de captación' : 'One-time leasing',
    rentFlowSummary: isSpanish
      ? `${formatOperatingAmount(details.monthlyRent)} de ingresos y ${formatOperatingAmount(details.totalMonthlyExpenses)} de costes`
      : `${formatOperatingAmount(details.monthlyRent)} in and ${formatOperatingAmount(details.totalMonthlyExpenses)} out`,
    nextRentUpdate: isSpanish ? 'Próxima actualización' : 'Next rent update',
    rentUpdateRule: isSpanish ? 'Regla de actualización' : 'Rent update rule',
    actual12mExpenses: isSpanish ? 'Gastos reales últimos 12 meses' : 'Actual trailing 12M expenses',
    projected12mExpenses: isSpanish ? 'Gastos proyectados próximos 12 meses' : 'Projected next 12M expenses',
    appliedPercent: isSpanish ? '% aplicado' : '% applied',
    index: isSpanish ? 'Índice' : 'Index',
    noRentAdjustments: isSpanish
      ? 'Todavía no hay actualizaciones de renta registradas.'
      : 'No rent adjustments recorded yet.',
  };

  const taxResidencyCountry =
    settings.taxProfile.taxResidencyCountry?.trim() || localizedCountry || taxSummaryLabels.noValue;
  const getCountryFlag = (countryName: string | undefined | null) => {
    const normalized = (countryName ?? '').trim().toLowerCase();

    switch (normalized) {
      case 'spain':
      case 'espana':
      case 'españa':
        return '🇪🇸';
      case 'portugal':
        return '🇵🇹';
      case 'argentina':
        return '🇦🇷';
      case 'united states':
      case 'usa':
      case 'us':
        return '🇺🇸';
      default:
        return null;
    }
  };
  const getSafeCountryFlag = (countryName: string | undefined | null) => {
    const normalized = (countryName ?? '').trim().toLowerCase();

    switch (normalized) {
      case 'spain':
      case 'espana':
      case 'españa':
        return '\u{1F1EA}\u{1F1F8}';
      case 'portugal':
        return '\u{1F1F5}\u{1F1F9}';
      case 'argentina':
        return '\u{1F1E6}\u{1F1F7}';
      case 'united states':
      case 'usa':
      case 'us':
        return '\u{1F1FA}\u{1F1F8}';
      default:
        return getCountryFlag(countryName);
    }
  };
  const propertyCountryFlag = getSafeCountryFlag(localizedCountry || property.country);
  const taxResidencyFlag = getSafeCountryFlag(taxResidencyCountry);
  const filingModeLabel = taxRuntime.spain?.ownerType || (isSpanish ? 'Individual' : 'Individual');
  const taxProfileEditSection = 'tax-assumptions';
  const taxProfileItems = [
    {
      key: 'country',
      label: taxSummaryLabels.country,
      value: localizedCountry || property.country || taxSummaryLabels.noValue,
      icon: Home,
      flag: propertyCountryFlag,
    },
    {
      key: 'tax-year',
      label: taxSummaryLabels.taxYear,
      value: String(taxRuntime.generic.taxYear),
      icon: CalendarDays,
    },
    {
      key: 'ownership',
      label: taxSummaryLabels.ownershipPercentage,
      value: formatPercentage(taxRuntime.generic.ownershipPercentage, 0),
      icon: Wallet2,
    },
    {
      key: 'tax-residency',
      label: taxSummaryLabels.taxResidency,
      value: taxResidencyCountry,
      icon: Shield,
      flag: taxResidencyFlag,
    },
    {
      key: 'filing-mode',
      label: taxSummaryLabels.filingMode,
      value: filingModeLabel,
      icon: Receipt,
    },
  ];

  const mortgageInterestBadge =
    taxRuntime.generic.deductibleExpenseItems.find((item) => item.id === 'mortgage-interest')?.badges?.[0];
  const estimateStatusBadge = taxRuntime.generic.statusIndicators.find((status) => status.id === 'estimate-status');
  const countryStatusBadge = taxRuntime.generic.statusIndicators.find((status) => status.id === 'country-status');
  const taxStatusBadges: Array<{
    id: string;
    label: string;
    tone: keyof typeof taxBadgeToneClasses;
    flag?: string | null;
  }> = [
    {
      id: 'module-badge',
      label: taxRuntime.profile.label,
      tone: taxRuntime.profile.country.toLowerCase() === 'spain' ? 'info' : 'neutral',
      flag: getSafeCountryFlag(taxRuntime.profile.country),
    },
    ...(mortgageInterestBadge
      ? [
          {
            id: mortgageInterestBadge.id,
            label: mortgageInterestBadge.label,
            tone: mortgageInterestBadge.tone,
          },
        ]
      : []),
    ...(estimateStatusBadge ? [estimateStatusBadge] : []),
    ...(countryStatusBadge ? [countryStatusBadge] : []),
  ];
  const taxFlowCards = [
    {
      key: 'gross-rental-income',
      label: taxSummaryLabels.grossRentalIncome,
      value: formatOperatingAmount(taxRuntime.generic.grossRentalIncome),
      icon: CircleDollarSign,
      panelClass: 'border-sky-100 bg-sky-50/90',
      labelToneClass: 'text-sky-700',
      valueToneClass: appTextStrongClass,
      subtext: undefined,
    },
    {
      key: 'deductible-expenses',
      label: taxSummaryLabels.deductibleExpenses,
      value: formatOperatingAmount(taxRuntime.generic.deductibleExpenses),
      icon: Receipt,
      panelClass: 'border-amber-100 bg-amber-50/90',
      labelToneClass: 'text-amber-700',
      valueToneClass: appTextStrongClass,
      subtext: undefined,
    },
    {
      key: 'net-income-before-tax',
      label: taxSummaryLabels.netIncomeBeforeTax,
      value: formatOperatingAmount(taxRuntime.generic.netIncomeBeforeTax),
      icon: ArrowDownUp,
      panelClass: 'border-violet-100 bg-violet-50/90',
      labelToneClass: 'text-violet-700',
      valueToneClass: appTextStrongClass,
      subtext: undefined,
    },
    {
      key: 'estimated-tax',
      label: taxSummaryLabels.estimatedTax,
      value: formatOperatingAmount(taxRuntime.generic.estimatedTax),
      icon: Percent,
      panelClass: 'border-emerald-100 bg-emerald-50/90',
      labelToneClass: 'text-emerald-700',
      valueToneClass: 'text-emerald-700 dark:text-emerald-300',
      subtext: taxRuntime.spain
        ? formatPercentage(taxRuntime.spain.estimatedPersonalMarginalIrpfRate * 100, 1)
        : undefined,
    },
    {
      key: 'annual-after-tax-cashflow',
      label: taxSummaryLabels.annualAfterTaxCashflow,
      value: formatOperatingAmount(taxRuntime.generic.annualAfterTaxCashflow),
      icon: TrendingUp,
      panelClass: 'border-[rgba(31,79,136,0.18)] bg-[linear-gradient(135deg,rgba(31,79,136,0.96),rgba(38,94,165,0.9))]',
      labelToneClass: 'text-white/80',
      valueToneClass: 'text-white',
      subtext: formatOperatingAmount(taxRuntime.generic.monthlyAfterTaxCashflow),
    },
  ];

  const taxSummaryFacts = [
    {
      key: 'tax-module',
      label: taxSummaryLabels.taxModule,
      value: taxRuntime.profile.label,
    },
    {
      key: 'non-deductible-expenses',
      label: taxSummaryLabels.nonDeductibleExpenses,
      value: formatOperatingAmount(taxRuntime.generic.nonDeductibleExpenses),
    },
    taxRuntime.spain
      ? {
          key: 'reduction-rate',
          label: taxSummaryLabels.reductionRate,
          value: formatPercentage(taxRuntime.spain.reductionRate * 100, 0),
        }
      : {
          key: 'monthly-after-tax-cashflow',
          label: taxSummaryLabels.monthlyAfterTaxCashflow,
          value: formatOperatingAmount(taxRuntime.generic.monthlyAfterTaxCashflow),
        },
    taxRuntime.spain
      ? {
          key: 'taxable-income-after-reduction',
          label: taxSummaryLabels.taxableIncomeAfterReduction,
          value: formatOperatingAmount(taxRuntime.spain.taxableIncomeAfterHousingReduction),
        }
      : {
          key: 'estimated-tax',
          label: taxSummaryLabels.estimatedTax,
          value: formatOperatingAmount(taxRuntime.generic.estimatedTax),
        },
  ];

  const taxAssumptionItems = [
    {
      key: 'module',
      title: taxRuntime.profile.label,
      body: isSpanish
        ? 'Reglas especificas del pais activas.'
        : 'Country-specific tax rules applied.',
      icon: Landmark,
    },
    {
      key: 'mortgage-interest',
      title: isSpanish ? 'Intereses hipotecarios deducibles' : 'Mortgage interest deductible',
      body: isSpanish
        ? 'Solo se deduce el interes; nunca el principal.'
        : 'Interest only. Principal is never deductible.',
      icon: Receipt,
    },
    {
      key: 'estimates-only',
      title: isSpanish ? 'Solo estimaciones' : 'Estimates only',
      body: isSpanish ? 'Resumen orientativo para planificacion.' : 'Planning estimate, not a filing output.',
      icon: Banknote,
    },
    {
      key: 'professional-review',
      title: isSpanish ? 'Confirmar con un profesional' : 'Confirm with a Professional',
      body: isSpanish
        ? 'Validar con asesor fiscal local.'
        : 'Validate with a local tax professional.',
      icon: Shield,
    },
  ];

  const taxPracticalNotes = [
    taxRuntime.spain
      ? {
          key: 'reduction-rate',
          label: taxSummaryLabels.reductionRate,
          value: formatPercentage(taxRuntime.spain.reductionRate * 100, 0),
        }
      : null,
    taxRuntime.spain
      ? {
          key: 'estimated-rate',
          label: taxSummaryLabels.estimatedMarginalRate,
          value: formatPercentage(taxRuntime.spain.estimatedPersonalMarginalIrpfRate * 100, 1),
        }
      : null,
    taxRuntime.spain
      ? {
          key: 'rental-type',
          label: taxSummaryLabels.rentalType,
          value: taxRuntime.spain.rentalType,
        }
      : null,
    taxRuntime.spain
      ? {
          key: 'autonomous-community',
          label: taxSummaryLabels.autonomousCommunity,
          value: taxRuntime.spain.autonomousCommunity,
        }
      : null,
  ].filter((item): item is { key: string; label: string; value: string } => Boolean(item));

  const purchasePricePerSqm =
    property.builtAreaSqm && property.builtAreaSqm > 0
      ? property.purchasePrice / property.builtAreaSqm
      : null;
  const currentEstimatedPricePerSqm =
    property.builtAreaSqm && property.builtAreaSqm > 0
      ? property.currentEstimatedValue / property.builtAreaSqm
      : null;

  const propertyMetadataItems: PropertyMetadataItem[] = [
    property.bedrooms
      ? {
          key: 'bedrooms',
          icon: BedDouble,
          value: `${property.bedrooms} ${t('properties.labels.bedroomsShort')}`,
        }
      : null,
    property.bathrooms
      ? {
          key: 'bathrooms',
          icon: Bath,
          value: `${property.bathrooms} ${t('properties.labels.bathroomsShort')}`,
        }
      : null,
    property.builtAreaSqm
      ? {
          key: 'builtAreaSqm',
          icon: Ruler,
          value: `${property.builtAreaSqm} m2`,
        }
      : null,
    property.parkingSpaces
      ? {
          key: 'parkingSpaces',
          icon: Home,
          value: isSpanish
            ? `${property.parkingSpaces} ${property.parkingSpaces === 1 ? 'plaza' : 'plazas'}`
            : `${property.parkingSpaces} ${property.parkingSpaces === 1 ? 'space' : 'spaces'}`,
        }
      : null,
    property.yearBuilt
      ? {
          key: 'yearBuilt',
          icon: CalendarDays,
          value: String(property.yearBuilt),
        }
      : null,
  ].filter(Boolean) as PropertyMetadataItem[];

  const propertyOverviewFacts = [
    localizedPropertyType
      ? { label: t('properties.labels.propertyType'), value: localizedPropertyType }
      : null,
    property.parkingCoverage
      ? {
          label: t('properties.form.parkingCoverage'),
          value:
            property.parkingCoverage === 'covered'
              ? t('properties.form.parkingCoverageOptions.covered')
              : t('properties.form.parkingCoverageOptions.uncovered'),
        }
      : null,
    property.hasStorageRoom
      ? { label: t('properties.form.storageIncluded'), value: t('common.yes') }
      : null,
    property.leaseType
      ? { label: t('properties.labels.leaseType'), value: property.leaseType }
      : null,
    rentRuleSummary
      ? { label: isSpanish ? 'Regla de actualización de renta' : 'Rent update rule', value: rentRuleSummary }
      : null,
    nextLeaseUpdateDate
      ? { label: isSpanish ? 'Próxima actualización de renta' : 'Next rent update', value: formatLanguageDate(nextLeaseUpdateDate) }
      : null,
    property.leaseEndDate
      ? { label: t('properties.labels.leaseEndDate'), value: formatLanguageDate(property.leaseEndDate) }
      : null,
    property.yearBuilt
      ? { label: t('properties.labels.yearBuilt'), value: String(property.yearBuilt) }
      : null,
    property.renovatedYear
      ? { label: t('properties.labels.renovatedYear'), value: String(property.renovatedYear) }
      : null,
    property.furnishedStatus
      ? { label: t('properties.labels.furnishedStatus'), value: property.furnishedStatus }
      : null,
    purchasePricePerSqm
      ? {
          label: t('properties.labels.purchasePerSqm'),
          value: `${formatPerSquareMeterAmount(purchasePricePerSqm, purchasePriceCurrency)}/m2`,
        }
      : null,
    currentEstimatedPricePerSqm
      ? {
          label: t('properties.labels.estimatedPerSqm'),
          value: `${formatPerSquareMeterAmount(
            currentEstimatedPricePerSqm,
            currentEstimatedValueCurrency
          )}/m2`,
        }
      : null,
  ].filter(
    (item): item is { label: string; value: string } => Boolean(item && item.value)
  );

  const leaseSummaryItems = [
    { label: t('properties.form.occupancyStatus'), value: occupancyLabel },
    activeLease?.endDate || property.leaseEndDate
      ? { label: 'Lease end', value: formatLanguageDate(activeLease?.endDate ?? property.leaseEndDate ?? '') }
      : null,
    property.leaseType ? { label: t('properties.form.leaseType'), value: property.leaseType } : null,
    rentRuleSummary ? { label: 'Rent update rule', value: rentRuleSummary } : null,
    nextLeaseUpdateDate ? { label: 'Next update', value: formatLanguageDate(nextLeaseUpdateDate) } : null,
    activeLease?.securityDeposit != null
      ? { label: 'Deposit', value: formatOperatingAmount(activeLease.securityDeposit ?? 0, depositCurrency) }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item && item.value));

  const propertyDetailItems = [
    localizedPropertyType ? { label: t('properties.form.propertyType'), value: localizedPropertyType } : null,
    property.bedrooms || property.bathrooms
      ? {
          label: `${t('properties.labels.bedroomsShort')} / ${t('properties.labels.bathroomsShort')}`,
          value: `${property.bedrooms ?? 0} / ${property.bathrooms ?? 0}`,
        }
      : null,
    property.builtAreaSqm ? { label: t('properties.form.builtAreaSqm'), value: `${property.builtAreaSqm} m2` } : null,
    property.floor != null ? { label: t('properties.form.floor'), value: String(property.floor) } : null,
    property.yearBuilt ? { label: t('properties.form.yearBuilt'), value: String(property.yearBuilt) } : null,
    property.renovatedYear ? { label: t('properties.form.renovatedYear'), value: String(property.renovatedYear) } : null,
    property.furnishedStatus ? { label: t('properties.form.furnishedStatus'), value: property.furnishedStatus } : null,
    property.condition ? { label: t('properties.form.condition'), value: property.condition } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item && item.value));

  const purchasePerSqm =
    property.builtAreaSqm && property.builtAreaSqm > 0 ? property.purchasePrice / property.builtAreaSqm : null;
  const estPerSqm =
    property.builtAreaSqm && property.builtAreaSqm > 0 ? property.currentEstimatedValue / property.builtAreaSqm : null;

  const purchaseDetailItems = [
    purchasePerSqm ? { label: t('properties.labels.purchasePerSqm'), value: `${formatValuationAmount(purchasePerSqm)}/m2` } : null,
    estPerSqm ? { label: t('properties.labels.estimatedPerSqm'), value: `${formatValuationAmount(estPerSqm)}/m2` } : null,
    totalCost > 0 ? { label: t('properties.form.totalInitialInvestment'), value: formatOperatingAmount(totalCost) } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item && item.value));

  const valuationIncrease =
    Number.isFinite(property.purchasePrice) &&
    property.purchasePrice > 0 &&
    Number.isFinite(property.currentEstimatedValue) &&
    property.currentEstimatedValue > 0
      ? property.currentEstimatedValue - property.purchasePrice
      : null;
  const valuationIncreasePercent =
    valuationIncrease !== null && property.purchasePrice > 0
      ? (valuationIncrease / property.purchasePrice) * 100
      : null;
  const mortgageLtv =
    details.currentMortgageBalance > 0 && property.currentEstimatedValue > 0
      ? (details.currentMortgageBalance / property.currentEstimatedValue) * 100
      : null;

  const tabItems: Array<{ key: PropertyTab; label: string }> = [
    { key: 'overview', label: t('properties.tabs.summary') },
    { key: 'finances', label: t('properties.tabs.finances') },
    { key: 'mortgage', label: t('properties.tabs.mortgage') },
    { key: 'documents', label: t('nav.documents') },
    { key: 'taxes', label: t('properties.tabs.tax') },
    { key: 'notes', label: t('common.notes') },
    { key: 'gallery', label: t('properties.tabs.gallery') },
  ];

  const currentGalleryImage = galleryImages[selectedImageIndex] ?? '';
  const safeCurrentGalleryImage = currentGalleryImage && typeof currentGalleryImage === 'string' ? currentGalleryImage : '';
  const hasMultipleImages = galleryImages.length > 1;

  const goToPreviousImage = () => {
    if (galleryImages.length === 0) {
      return;
    }

    setSelectedImageIndex((currentIndex) =>
      currentIndex === 0 ? galleryImages.length - 1 : currentIndex - 1
    );
  };

  const goToNextImage = () => {
    if (galleryImages.length === 0) {
      return;
    }

    setSelectedImageIndex((currentIndex) =>
      currentIndex === galleryImages.length - 1 ? 0 : currentIndex + 1
    );
  };

  const handleGalleryTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  };

  const handleGalleryTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (!hasMultipleImages || touchStartX === null) {
      setTouchStartX(null);
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
    const delta = touchEndX - touchStartX;

    if (Math.abs(delta) < 40) {
      setTouchStartX(null);
      return;
    }

    if (delta < 0) {
      goToNextImage();
    } else {
      goToPreviousImage();
    }

    setTouchStartX(null);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) {
      return null;
    }

    const item = payload[0]?.payload;

    return (
      <div className={`${chartTooltipSurfaceClass} min-w-[168px] rounded-2xl px-4 py-3`}>
        <p className={`text-sm font-semibold ${appTextStrongClass}`}>{item.name}</p>
        <p className={`mt-1 text-sm ${appTextMutedClass}`}>{formatOperatingAmount(item.value)}</p>
      </div>
    );
  };

  const renderHeroGallery = (showHeader = true, compact = false) => {
    if (!ENABLE_REAL_PROPERTY_GALLERY) {
      const safeLabels = galleryImages.slice(0, 6).map((_, index) => `Image ${index + 1}`);

      return (
        <div className={showHeader ? `border-b px-5 py-4 ${appBorderClass}` : ''}>
          <div className={`${insetPanelClass} rounded-[18px] p-4`}>
            {showHeader ? (
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>
                    {t('properties.tabs.gallery')}
                  </p>
                  <p className={`mt-1 text-[13px] ${appTextMutedClass}`}>
                    {galleryImages.length} {galleryImages.length === 1 ? 'image' : 'images'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(property, 'gallery')}
                  className={sectionEditButtonClass}
                  title={t('common.edit')}
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span className="sr-only">{t('common.edit')}</span>
                </button>
              </div>
            ) : null}
            <div className="rounded-[16px] border border-dashed border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <p className={`text-sm font-medium ${appTextStrongClass}`}>Gallery temporarily simplified for stability</p>
              <ul className={`mt-3 space-y-1 text-sm ${appTextMutedClass}`}>
                {safeLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    const wrapperPaddingClass = compact ? 'p-1.5' : 'p-2';
    const galleryGridClass = compact
      ? 'grid grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,1.08fr)_160px]'
      : 'grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.08fr)_196px]';
    const frameMinHeightClass = compact
      ? 'min-h-[160px] sm:min-h-[196px]'
      : 'min-h-[220px] sm:min-h-[316px]';
    const imageMaxHeightClass = compact ? 'max-h-[250px]' : 'max-h-[470px]';
    const outerButtonPaddingClass = compact ? 'px-1.5 py-1.5 sm:px-2.5 sm:py-2.5' : 'px-2.5 py-2.5 sm:px-4 sm:py-4';
    const overlayPaddingClass = compact ? 'px-2.5 py-2.5 sm:px-3.5 sm:py-3.5' : 'px-4 py-4 sm:px-6 sm:py-6';
    const thumbnailHeightClass = compact ? 'h-[58px]' : 'h-[70px]';
    const bottomThumbClass = compact ? 'h-12 w-18 rounded-[9px]' : 'h-14 w-20 rounded-[10px]';

    if (galleryImages.length === 0) {
      return (
        <div className={showHeader ? `border-b px-5 py-4 ${appBorderClass}` : ''}>
          <div className={`${nestedPanelClass} flex min-h-[160px] flex-col items-center justify-center border border-dashed ${appBorderClass} p-4 text-center`}>
            <p className={`text-base font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>{galleryEmptyTitle}</p>
            <p className={`mt-2 max-w-sm text-sm leading-6 ${appTextMutedClass}`}>{galleryEmptyBody}</p>
            <button
              type="button"
              onClick={() => onEdit(property, 'gallery')}
              className={`mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
            >
              <Edit className="h-4 w-4" />
              <span>{t('common.edit')}</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={showHeader ? `border-b px-5 py-4 ${appBorderClass}` : ''}>
        <div className={`${insetPanelClass} overflow-hidden rounded-[18px] ${wrapperPaddingClass}`}>
          {showHeader ? (
            <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>
                  {t('properties.tabs.gallery')}
                </p>
                <p className={`mt-1 text-[13px] ${appTextMutedClass}`}>
                  {t(
                    galleryImages.length === 1
                      ? 'propertiesUi.galleryCount_one'
                      : 'propertiesUi.galleryCount_other',
                    { count: galleryImages.length }
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(property, 'gallery')}
                className={sectionEditButtonClass}
                title={t('common.edit')}
              >
                <Edit className="h-3.5 w-3.5" />
                <span className="sr-only">{t('common.edit')}</span>
              </button>
            </div>
          ) : null}
          <div className={galleryGridClass}>
            <div className="relative overflow-hidden rounded-[20px] border border-slate-200/40 bg-[linear-gradient(180deg,rgba(244,246,248,0.72)_0%,rgba(234,238,242,0.48)_100%)] shadow-[0_20px_48px_-42px_rgba(15,23,42,0.16)] dark:border-white/7 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88)_0%,rgba(5,10,18,0.92)_100%)] dark:shadow-[0_30px_72px_-42px_rgba(2,6,23,0.52)]">
              <div className="absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl saturate-[1.05] dark:opacity-36 dark:saturate-[1.12]" style={{ backgroundImage: safeCurrentGalleryImage ? `url(${safeCurrentGalleryImage})` : 'none' }} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.3),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.03)_42%,rgba(15,23,42,0.16)_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.08),transparent_26%),linear-gradient(180deg,rgba(8,15,28,0.12)_0%,rgba(8,15,28,0.34)_54%,rgba(8,15,28,0.62)_100%)]" />
              <div className="absolute inset-[1px] rounded-[23px] border border-white/14 dark:border-white/6" />
              <button type="button" onClick={() => setIsLightboxOpen(true)} onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd} className={`group relative block w-full ${outerButtonPaddingClass}`}>
                <div className={`relative flex items-center justify-center overflow-hidden rounded-[18px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.38)_0%,rgba(255,255,255,0.14)_100%)] px-1 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_40px_-36px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.015)_100%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_48px_-32px_rgba(2,6,23,0.68)] ${frameMinHeightClass}`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22),transparent_60%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_58%)]" />
                  {safeCurrentGalleryImage ? (
                    <img src={safeCurrentGalleryImage} alt={`${property.name} ${t('propertiesUi.galleryCount_one', { count: selectedImageIndex + 1 })}`} className={`relative z-[1] w-full rounded-[16px] object-contain object-center drop-shadow-[0_24px_40px_rgba(15,23,42,0.2)] transition duration-300 group-hover:scale-[1.01] dark:drop-shadow-[0_28px_46px_rgba(2,6,23,0.42)] ${imageMaxHeightClass}`} />
                  ) : (
                    <div className={`relative z-[1] flex w-full items-center justify-center rounded-[16px] bg-[var(--app-panel-inset)] ${imageMaxHeightClass}`}>
                      <p className={appTextMutedClass}>No image available</p>
                    </div>
                  )}
                </div>
                <div className={`pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-3 ${overlayPaddingClass}`}>
                  <span className={`inline-flex items-center gap-2 rounded-full border border-slate-200/45 bg-[linear-gradient(180deg,rgba(255,251,246,0.74)_0%,rgba(245,239,231,0.72)_100%)] px-3 py-1.5 text-xs font-medium text-slate-700 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-white/10 dark:bg-slate-950/42 dark:text-white dark:shadow-[0_18px_30px_-24px_rgba(2,6,23,0.55)] ${compact ? 'px-2.5 py-1 sm:sm:px-2.5 sm:py-1' : ''}`}>
                    <Expand className="h-3.5 w-3.5" />
                    <span className={`${compact ? 'hidden md:inline' : 'hidden sm:inline'}`}>{t('properties.labels.viewAllPhotos')}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/45 bg-[linear-gradient(180deg,rgba(255,251,246,0.74)_0%,rgba(245,239,231,0.72)_100%)] px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-white/10 dark:bg-slate-950/42 dark:text-white dark:shadow-[0_18px_30px_-24px_rgba(2,6,23,0.55)]">
                    {selectedImageIndex + 1} / {galleryImages.length}
                  </span>
                </div>
              </button>

              {hasMultipleImages ? (
                <>
                  <button type="button" onClick={goToPreviousImage} className="absolute left-3 top-1/2 z-[3] hidden -translate-y-1/2 rounded-full border border-slate-200/52 bg-[linear-gradient(180deg,rgba(255,251,246,0.78)_0%,rgba(245,239,231,0.76)_100%)] p-2.5 text-slate-700 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:border-slate-300/70 hover:text-slate-800 dark:border-white/10 dark:bg-slate-950/48 dark:text-white dark:shadow-[0_18px_40px_-28px_rgba(2,6,23,0.58)] dark:hover:text-cyan-300 sm:left-5 sm:block" aria-label={t('common.previousImage')}>
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={goToNextImage} className="absolute right-3 top-1/2 z-[3] hidden -translate-y-1/2 rounded-full border border-slate-200/52 bg-[linear-gradient(180deg,rgba(255,251,246,0.78)_0%,rgba(245,239,231,0.76)_100%)] p-2.5 text-slate-700 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.12)] backdrop-blur-md transition hover:border-slate-300/70 hover:text-slate-800 dark:border-white/10 dark:bg-slate-950/48 dark:text-white dark:shadow-[0_18px_40px_-28px_rgba(2,6,23,0.58)] dark:hover:text-cyan-300 sm:right-5 sm:block" aria-label={t('common.nextImage')}>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}
            </div>

            <div className="hidden grid-cols-2 gap-2 md:grid md:grid-cols-1">
              {galleryImages.slice(0, 4).map((imageUrl, index) => {
                const isActive = index === selectedImageIndex;
                return (
                  <button key={`${imageUrl}-${index}`} type="button" onClick={() => setSelectedImageIndex(index)} className={`group relative overflow-hidden rounded-[16px] border p-1 text-left transition ${isActive ? 'border-cyan-400/24 bg-cyan-500/6 shadow-[0_12px_24px_-26px_rgba(6,182,212,0.24)]' : `${appBorderClass} bg-[var(--app-panel-soft)] hover:border-slate-300/55 hover:bg-[var(--app-panel-elevated)] dark:hover:border-white/14`}`}>
                    <div className="relative overflow-hidden rounded-[12px]">
                      {imageUrl ? (
                        <img src={galleryThumbnailImages[index] ?? imageUrl} alt={`${property.name} preview ${index + 1}`} className={`w-full rounded-[15px] object-cover object-center transition duration-300 group-hover:scale-[1.025] ${thumbnailHeightClass}`} />
                      ) : null}
                      <div className={`absolute inset-0 transition ${isActive ? 'bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.12)_100%)] dark:bg-[linear-gradient(180deg,transparent_0%,rgba(8,15,28,0.18)_100%)]' : 'bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.18)_100%)] group-hover:bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.12)_100%)] dark:bg-[linear-gradient(180deg,transparent_0%,rgba(8,15,28,0.28)_100%)] dark:group-hover:bg-[linear-gradient(180deg,transparent_0%,rgba(8,15,28,0.16)_100%)]'}`} />
                    </div>
                    <div className="mt-2 flex items-center justify-between px-1">
                      <span className={`text-[11px] font-medium tracking-[0.04em] ${isActive ? 'text-cyan-700 dark:text-cyan-300' : appTextMutedClass}`}>
                        {index + 1}
                      </span>
                      <span className={`inline-flex h-2 w-2 rounded-full transition ${isActive ? 'bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.12)]' : 'bg-slate-400/40 group-hover:bg-slate-500/60 dark:bg-white/24 dark:group-hover:bg-[linear-gradient(180deg,rgba(255,251,246,0.64)_0%,rgba(245,239,231,0.62)_100%)]'}`} />
                    </div>
                  </button>
                );
              })}
              {galleryImages.length > 4 ? (
                <button type="button" onClick={() => setActiveTab('gallery')} className={`flex min-h-[68px] items-center justify-center rounded-[16px] border border-dashed px-3 py-2 text-center text-sm font-medium transition ${appBorderClass} ${appTextMutedClass} bg-[var(--app-panel-soft)] hover:border-cyan-400/35 hover:text-cyan-700 dark:hover:text-cyan-300`}>
                  +{galleryImages.length - 4} {t('properties.labels.morePhotos')}
                </button>
              ) : null}
            </div>
          </div>

          {galleryImages.length > 1 ? (
            <div className={`overflow-x-auto pb-1 ${compact ? 'mt-1 flex gap-1.5' : 'mt-2 flex gap-1.5'}`}>
              {galleryImages.map((imageUrl, index) => {
                const isActive = index === selectedImageIndex;
                return (
                  <button key={`${imageUrl}-${index}`} type="button" onClick={() => setSelectedImageIndex(index)} className={`group relative shrink-0 overflow-hidden rounded-[16px] border p-1 transition ${isActive ? 'border-cyan-400/24 bg-cyan-500/6 shadow-[0_12px_24px_-24px_rgba(6,182,212,0.24)]' : `${appBorderClass} bg-[var(--app-panel-soft)] hover:border-slate-300/55 hover:bg-[var(--app-panel-elevated)] dark:hover:border-white/14`}`}>
                    <img src={galleryThumbnailImages[index] ?? imageUrl} alt={`${property.name} thumbnail ${index + 1}`} className={`object-cover object-center transition duration-300 ${isActive ? 'scale-[1.01] brightness-100' : 'brightness-[0.94] group-hover:brightness-100'} ${bottomThumbClass}`} />
                    <span className={`pointer-events-none absolute right-3 top-3 h-2 w-2 rounded-full transition ${isActive ? 'bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.14)]' : 'bg-slate-400/40 group-hover:bg-slate-500/60 dark:bg-white/24 dark:group-hover:bg-[linear-gradient(180deg,rgba(255,251,246,0.64)_0%,rgba(245,239,231,0.62)_100%)]'}`} />
                    <span className={`pointer-events-none absolute inset-x-1.5 bottom-1.5 h-0.5 rounded-full transition ${isActive ? 'bg-gradient-to-r from-cyan-400 via-sky-500 to-cyan-400 opacity-100' : 'bg-slate-400 opacity-0 group-hover:opacity-35'}`} />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderSummaryPreview = () => {
    if (!currentGalleryImage) {
      return (
        <div className="flex min-h-[210px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[var(--app-border)] bg-[var(--app-panel-inset)] px-5 py-7 text-center">
          <p className={`text-sm font-semibold ${appTextStrongClass}`}>{galleryEmptyTitle}</p>
          <p className={`mt-1.5 max-w-xs text-[13px] leading-5 ${appTextMutedClass}`}>{galleryEmptyBody}</p>
          <button type="button" onClick={() => onEdit(property, 'gallery')} className={`mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ${appButtonMutedClass} ${appTextMutedClass}`}>
            <Plus className="h-3.5 w-3.5" />
            {t('properties.form.clickToUpload')}
          </button>
        </div>
      );
    }

    return (
      <div className="grid h-[300px] gap-2 sm:h-[330px] sm:grid-cols-[minmax(0,1fr)_76px] 2xl:h-[370px]">
        <div className="relative h-full min-h-0 overflow-hidden rounded-[18px] bg-[var(--app-panel-inset)]">
          <button type="button" onClick={() => setIsLightboxOpen(true)} onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd} className="group block h-full w-full" aria-label={t('properties.labels.viewAllPhotos')}>
            <img src={currentGalleryImage} alt={`${property.name} ${selectedImageIndex + 1}`} className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.01]" />
          </button>
          <span className="absolute bottom-3 left-3 rounded-full bg-slate-950/72 px-2.5 py-1 text-[11px] font-semibold text-white">{selectedImageIndex + 1} / {galleryImages.length}</span>
          {hasMultipleImages ? <>
            <button type="button" onClick={goToPreviousImage} className="absolute bottom-3 right-12 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white transition hover:bg-slate-950" aria-label={t('properties.labels.viewAllPhotos')}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={goToNextImage} className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white transition hover:bg-slate-950" aria-label={t('properties.labels.viewAllPhotos')}><ChevronRight className="h-4 w-4" /></button>
          </> : null}
        </div>
        {galleryImages.length > 1 ? <div className="flex h-full min-h-0 gap-1.5 overflow-x-auto pb-1 sm:flex-col sm:overflow-hidden sm:pb-0">
          {galleryImages.slice(0, 4).map((imageUrl, index) => <button key={`${imageUrl}-${index}`} type="button" onClick={() => setSelectedImageIndex(index)} className={`shrink-0 overflow-hidden rounded-[10px] border p-0.5 transition sm:min-h-0 sm:flex-1 ${index === selectedImageIndex ? 'border-[var(--app-nav-active-fg)]' : `${appBorderClass} opacity-75 hover:opacity-100`}`}><img src={galleryThumbnailImages[index] ?? imageUrl} alt={`${property.name} thumbnail ${index + 1}`} className="h-12 w-16 rounded-[7px] object-cover sm:h-full sm:w-full" /></button>)}
          {galleryImages.length > 4 ? <button type="button" onClick={() => setActiveTab('gallery')} className={`flex min-h-12 items-center justify-center rounded-[10px] border border-dashed px-2 text-[11px] font-semibold sm:min-h-0 sm:flex-1 ${appBorderClass} ${appTextMutedClass}`}>+{galleryImages.length - 4}</button> : null}
        </div> : null}
      </div>
    );
  };

  const renderCompactStatCard = (label: string, value: string, subtext?: string, toneClass = appTextStrongClass) => (
    <div className="rounded-[16px] border border-slate-200/70 bg-white px-3.5 py-3.5 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.16)]">
      <p className={`text-[12px] font-medium ${appTextMutedClass}`}>{label}</p>
      <p className={`mt-1.5 text-[1rem] font-semibold tracking-[-0.03em] ${toneClass}`}>{value}</p>
      {subtext ? <p className={`mt-1 text-[12px] leading-5 ${appTextMutedClass}`}>{subtext}</p> : null}
    </div>
  );

  const getDocumentCategoryLabel = (categoryKey: PropertyDocumentCategoryKey) =>
    documentCategoryMeta.find((item) => item.key === categoryKey)?.label ?? categoryKey;

  const getDocumentStatusMeta = (status: PropertyDocumentStatus) => {
    if (status === 'uploaded') {
      return {
        label: isSpanish ? 'Cargado' : 'Uploaded',
        className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    }

    if (status === 'missing') {
      return {
        label: isSpanish ? 'Falta' : 'Missing',
        className: 'border border-rose-200 bg-rose-50 text-rose-700',
      };
    }

    if (status === 'upload-needed') {
      return {
        label: isSpanish ? 'Carga necesaria' : 'Upload needed',
        className: 'border border-amber-200 bg-amber-50 text-amber-700',
      };
    }

    return {
      label: isSpanish ? 'Sugerido' : 'Suggested',
      className: 'border border-slate-200 bg-slate-50 text-slate-700',
    };
  };

  const renderDocumentsEmptyState = () => (
    <div className={`${nestedPanelClass} overflow-hidden`}>
      <div className="border-b border-slate-200/70 px-6 py-5">
        <h3 className={`text-[1.1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
          {isSpanish ? 'Documentos' : 'Documents'}
        </h3>
        <p className={`mt-1.5 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>
          {isSpanish
            ? 'Guarda contratos, facturas, recibos fiscales, polizas, archivos de reformas y otros registros administrativos de esta propiedad.'
            : 'Store contracts, invoices, tax receipts, insurance files, renovation records, and other administrative property documents here.'}
        </p>
      </div>
      <div className="px-6 py-8">
        <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.94)_100%)] px-6 py-10 text-center shadow-[0_24px_48px_-40px_rgba(15,23,42,0.16)]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_18px_30px_-28px_rgba(15,23,42,0.18)]">
            <FileText className="h-9 w-9 text-slate-400" />
          </div>
          <h4 className={`mt-5 text-[1.75rem] font-semibold tracking-[-0.05em] ${appTextStrongClass}`}>
            {isSpanish ? 'Todavia no hay documentos cargados' : 'No documents uploaded yet'}
          </h4>
          <p className={`mx-auto mt-3 max-w-xl text-sm leading-6 ${appTextMutedClass}`}>
            {isSpanish
              ? 'Sube escrituras, contratos de alquiler, facturas, polizas y recibos para organizar los archivos operativos de esta propiedad.'
              : 'Upload deeds, lease agreements, invoices, insurance policies, and tax receipts to organize this propertys operating files.'}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 text-[12px] font-medium text-slate-600">
            <Clock3 className="h-3.5 w-3.5" />
            <span>
              {isSpanish
                ? 'Vista contextual solamente por ahora'
                : 'Contextual view only for now'}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {documentCategoryMeta
              .filter((item) =>
                ['legal', 'rental', 'expenses-tax', 'insurance', 'renovations'].includes(item.key)
              )
              .map((item) => (
                <span
                  key={item.key}
                  className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600"
                >
                  {item.label}
                </span>
              ))}
          </div>
        </div>

        {suggestedDocuments.length > 0 ? (
          <div className="mt-6 rounded-[22px] border border-slate-200/75 bg-white px-5 py-4 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.14)]">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-slate-400" />
              <p className={`text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                {isSpanish ? 'Documentos sugeridos' : 'Suggested documents'}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {suggestedDocuments.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200/75 bg-[var(--app-panel-inset)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${appTextStrongClass}`}>{item.name}</p>
                    <p className={`mt-1 text-[12px] ${appTextMutedClass}`}>{item.sourceLabel}</p>
                  </div>
                  <span className="h-3 w-3 rounded-full border border-slate-200 bg-white" />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderInfoGrid = (items: Array<{ label: string; value: string }>) => (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-1">
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-[var(--app-border)] py-2 last:border-b-0 sm:py-2.5"
        >
          <p className={`min-w-0 text-[12px] leading-5 ${appTextMutedClass}`}>{item.label}</p>
          <p className={`text-right text-[13px] font-semibold leading-5 ${appTextStrongClass}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );

  const renderPropertyHeaderDetails = () => (
    <div className="flex flex-wrap items-start gap-3.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-inset)] text-[var(--app-nav-active-fg)]">
        <Home className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h3 className={`text-[1.45rem] font-semibold leading-tight tracking-[-0.04em] ${appTextStrongClass} sm:text-[1.85rem]`}>{property.name}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${getOccupancyBadgeClasses(property.occupancyStatus)}`}>{occupancyLabel}</span>
        </div>
        <p className={`mt-1 text-[12px] ${appTextMutedClass}`}>{property.city}, {localizedCountry}</p>
        <p className={`mt-0.5 text-[12px] ${appTextMutedClass}`}>{property.address}</p>
        <p className={`mt-1.5 inline-flex rounded-full border border-[var(--app-border)] bg-[var(--app-panel-inset)] px-2.5 py-0.5 text-[10px] font-medium ${appTextMutedClass}`}>
          {currencyContextLabel}
        </p>
        <div className="mt-3.5 grid grid-cols-2 gap-2 xl:grid-cols-5">
          {heroMetrics.map((metric) => (
            <div key={metric.label} className="rounded-[18px] border border-slate-200/75 bg-white px-4 py-3 shadow-[0_10px_22px_-26px_rgba(15,23,42,0.18)]">
              <p className={labelClass}>{metric.label}</p>
              <p className={`mt-1.5 text-[1rem] font-semibold tracking-[-0.04em] sm:text-[1.15rem] ${metric.tone}`}>{metric.value}</p>
            </div>
          ))}
        </div>
        {propertyOverviewFacts.length > 0 ? (
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {propertyOverviewFacts.map((fact) => (
              <div
                key={`${fact.label}-${fact.value}`}
                className="rounded-[18px] border border-slate-200/70 bg-[var(--app-panel-inset)] px-3.5 py-3"
              >
                <p className={labelClass}>{fact.label}</p>
                <p className={`mt-1 text-[13px] font-medium leading-4.5 ${appTextStrongClass}`}>
                  {fact.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <p className={labelClass}>{t('properties.labels.purchaseDate')}</p>
            <p className={`mt-1 font-medium ${appTextStrongClass}`}>{property.purchaseDate ? formatLanguageDate(property.purchaseDate) : t('common.notSpecified')}</p>
          </div>
          <div>
            <p className={labelClass}>{t('properties.form.occupancyStatus')}</p>
            <p className={`mt-1 font-medium ${appTextStrongClass}`}>{occupancyLabel}</p>
          </div>
          <div>
            <p className={labelClass}>{t('properties.labels.monthlyRent')}</p>
            <p className={`mt-1 font-medium ${successValueClass}`}>{formatOperatingAmount(details.monthlyRent)}</p>
          </div>
        </div>
        {propertyMetadataItems.length > 0 ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {propertyMetadataItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.key}
                  className={`inline-flex items-center gap-2 text-[12px] font-medium leading-5 ${appTextMutedClass}`}
                >
                  <Icon className="h-[15px] w-[15px] shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className={`whitespace-nowrap ${appTextStrongClass}`}>{item.value}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={panelClass}>
      <div className={`border-b px-4 py-3 sm:px-5 sm:py-3 ${appBorderClass} ${appPanelHeroClass}`} />

      {false && activeTab === 'overview' ? (
        <div
          data-tutorial-id="property-summary-overview"
          className={`border-b px-4 py-4 sm:px-5 sm:py-5 ${appBorderClass} ${appPanelHeroClass}`}
        >
          <div className="grid grid-cols-1 gap-4.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
            <div className="min-w-0">
              {renderPropertyHeaderDetails()}
            </div>
            <div className="min-w-0">
              {renderSummaryPreview()}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`border-b px-3.5 sm:px-4.5 ${appBorderClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <label className="block sm:hidden">
              <span className="sr-only">{isSpanish ? 'Seccion de la propiedad' : 'Property section'}</span>
              <select
                value={activeTab}
                onChange={(event) => {
                  const nextTab = event.target.value as PropertyTab;
                  onRequestTabChange?.(nextTab);
                  setActiveTab(nextTab);
                }}
                className={`w-full ${appSelectClass} rounded-2xl px-3.5 py-2 text-[13px] font-medium ${appTextStrongClass}`}
              >
                {tabItems.map((tab) => (
                  <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="-mx-1 hidden h-11 gap-1 overflow-x-auto px-1 sm:flex sm:flex-wrap sm:overflow-visible">
              {tabItems.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    data-tutorial-id={
                      tab.key === 'finances'
                        ? 'property-tab-finances'
                        : tab.key === 'mortgage'
                        ? 'property-tab-mortgage'
                        : undefined
                    }
                    onClick={() => {
                      onRequestTabChange?.(tab.key);
                      setActiveTab(tab.key);
                    }}
                    className={`relative h-11 whitespace-nowrap px-3 text-[13px] font-medium transition after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${isActive ? 'text-[var(--app-nav-active-fg)] after:bg-[var(--app-nav-active-fg)]' : `${appTextMutedClass} after:bg-transparent hover:text-slate-700 dark:hover:text-slate-200`} ${tutorialTargetId === (tab.key === 'finances' ? 'property-tab-finances' : tab.key === 'mortgage' ? 'property-tab-mortgage' : null) ? 'app-tutorial-target' : ''}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {canGenerateReport ? (
              <button
                type="button"
                onClick={() => onGenerateReport?.(property)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium ${appButtonMutedClass} ${appTextMutedClass} hover:border-cyan-400/20 hover:text-cyan-700 dark:hover:text-cyan-300`}
                title={t('common.generateInvestmentMemo')}
              >
                {t('propertiesUi.report')}
              </button>
            ) : null}
            <button type="button" onClick={() => onEdit(property, null)} className={`rounded-full p-1.5 ${appButtonMutedClass} ${appTextMutedClass} hover:border-cyan-400/20 hover:text-cyan-700 dark:hover:text-cyan-300`} title={t('common.edit')}>
              <Edit className="h-4 w-4" />
              <span className="sr-only">{t('common.edit')}</span>
            </button>
            <button type="button" onClick={() => onDelete(property.id)} className={`rounded-full p-1.5 ${appButtonMutedClass} text-rose-500 hover:border-rose-400/20 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200`} title={t('common.delete')}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {activeTab === 'overview' ? (
        <div data-tutorial-id="property-summary-overview" className="space-y-3 px-4 py-3 sm:px-5 sm:py-3.5">
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(500px,1.1fr)] xl:items-start">
            <div className="min-w-0 pt-1 sm:pt-1.5 xl:pt-2">
              <h2 className={`text-[1.9rem] font-semibold tracking-[-0.05em] ${appTextStrongClass} sm:text-[2.2rem]`}>{property.name}</h2>
              <p className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium ${appTextStrongClass}`}><MapPin className="h-3.5 w-3.5 text-[var(--app-nav-active-fg)]" />{[property.city, localizedCountry].filter(Boolean).join(', ')}</p>
              {property.address ? <p className={`mt-0.5 text-[13px] ${appTextMutedClass}`}>{property.address}</p> : null}
              <div className="mt-3.5 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getOccupancyBadgeClasses(property.occupancyStatus)}`}>{occupancyLabel}</span>
                {localizedPropertyType ? <span className={`rounded-full border border-[var(--app-border)] bg-[var(--app-panel-inset)] px-2.5 py-1 text-[11px] font-medium ${appTextMutedClass}`}>{localizedPropertyType}</span> : null}
                {property.renovatedYear ? <span className={`rounded-full border border-[var(--app-border)] bg-[var(--app-panel-inset)] px-2.5 py-1 text-[11px] font-medium ${appTextMutedClass}`}>{t('properties.labels.renovatedYear')} {property.renovatedYear}</span> : null}
              </div>
            </div>
            <div className="min-w-0">{renderSummaryPreview()}</div>
          </section>

          <section className={`${nestedPanelClass} overflow-hidden`}>
            <div className="grid grid-cols-1 divide-y divide-[var(--app-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
              {heroMetrics.slice(0, 4).map((metric, index) => {
                const Icon = index === 0 ? Home : index === 1 ? TrendingUp : index === 2 ? Wallet2 : Landmark;
                const subtext = index === 3 && mortgageLtv !== null ? `${formatPercentage(mortgageLtv, 1)} LTV` : undefined;
                return <div key={metric.label} className="flex min-w-0 items-center gap-3.5 px-4 py-4 sm:px-5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${index === 1 || (index === 2 && details.netMonthlyCashflow >= 0) ? 'bg-emerald-500/10 text-emerald-600' : index === 3 ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-700'}`}><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0"><p className={`text-[1.38rem] font-semibold tracking-[-0.04em] ${metric.tone}`}>{metric.value}</p><p className={`mt-0.5 text-[12px] font-medium ${appTextMutedClass}`}>{metric.label}</p>{subtext ? <p className={`text-[11px] ${appTextMutedClass}`}>{subtext}</p> : null}</div>
                </div>;
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className={`${nestedPanelClass} ${cardPaddingClass}`}><div className="flex items-center justify-between gap-3"><h3 className={sectionTitleClass}>{t('propertiesUi.leaseAndTenancy')}</h3><button type="button" onClick={() => onEdit(property, 'lease-tenancy')} className={sectionEditButtonClass} title={t('common.edit')}><Edit className="h-3.5 w-3.5" /><span className="sr-only">{t('common.edit')}</span></button></div><div className="mt-2">{renderInfoGrid(leaseSummaryItems)}</div></div>
            <div className={`${nestedPanelClass} ${cardPaddingClass}`}><div className="flex items-center justify-between gap-3"><h3 className={sectionTitleClass}>{t('properties.labels.propertyDetails')}</h3><button type="button" onClick={() => onEdit(property, 'property-details')} className={sectionEditButtonClass} title={t('common.edit')}><Edit className="h-3.5 w-3.5" /><span className="sr-only">{t('common.edit')}</span></button></div><div className="mt-3 flex flex-wrap gap-1.5">{propertyMetadataItems.concat(property.floor != null ? [{ key: 'floor', icon: Expand, value: `${property.floor} ${t('properties.form.floor')}` }] : [], property.hasElevator ? [{ key: 'elevator', icon: Expand, value: t('properties.form.hasElevator') }] : []).slice(0, 5).map((item) => <span key={item.key} className={`inline-flex items-center gap-1 rounded-lg bg-[var(--app-panel-inset)] px-2 py-1 text-[11px] ${appTextMutedClass}`}><item.icon className="h-3.5 w-3.5" />{item.value}</span>)}</div><div className="mt-2">{renderInfoGrid(propertyDetailItems.filter((item) => !item.label.includes('/')))}</div></div>
            <div className={`${nestedPanelClass} ${cardPaddingClass}`}><div className="flex items-center justify-between gap-3"><h3 className={sectionTitleClass}>{t('propertiesUi.purchaseAndValuation')}</h3><button type="button" onClick={() => onEdit(property, 'purchase-details')} className={sectionEditButtonClass} title={t('common.edit')}><Edit className="h-3.5 w-3.5" /><span className="sr-only">{t('common.edit')}</span></button></div><div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><div><p className={labelClass}>{t('properties.form.purchasePrice')}</p><p className={valueClass}>{formatValuationAmount(property.purchasePrice, purchasePriceCurrency)}</p>{property.purchaseDate ? <p className={`mt-0.5 text-[11px] ${appTextMutedClass}`}>{formatLanguageDate(property.purchaseDate)}</p> : null}</div><TrendingUp className={`h-4 w-4 ${appTextMutedClass}`} /><div><p className={labelClass}>{t('properties.labels.estimatedValue')}</p><p className={valueClass}>{formatValuationAmount(property.currentEstimatedValue, currentEstimatedValueCurrency)}</p></div></div>{valuationIncrease !== null && valuationIncreasePercent !== null ? <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-500/8 px-3 py-2"><div><p className={`text-[12px] font-semibold ${successValueClass}`}>{valuationIncrease >= 0 ? '+' : ''}{formatValuationAmount(valuationIncrease, currentEstimatedValueCurrency)}</p><p className={`text-[11px] ${appTextMutedClass}`}>{t('properties.labels.estimatedValue')}</p></div><p className={`text-sm font-semibold ${valuationIncrease >= 0 ? successValueClass : dangerValueClass}`}>{valuationIncrease >= 0 ? '+' : ''}{formatPercentage(valuationIncreasePercent, 1)}</p></div> : null}<div className="mt-2">{renderInfoGrid(purchaseDetailItems)}</div></div>
          </section>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className={`${nestedPanelClass} ${cardPaddingClass}`}><div className="flex items-center justify-between gap-3"><h3 className={sectionTitleClass}>{t('properties.tabs.mortgage')}</h3>{mortgage || property.hasMortgage ? <button type="button" onClick={() => setActiveTab('mortgage')} className={`text-[11px] font-medium text-[var(--app-nav-active-fg)]`}>{t('propertiesUi.viewAll')} <ChevronRight className="inline h-3.5 w-3.5" /></button> : null}</div>{mortgage || property.hasMortgage ? <><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"><div><p className={`text-[13px] font-semibold ${appTextStrongClass}`}>{mortgageLenderLabel}</p><p className={`mt-2 text-[11px] ${appTextMutedClass}`}>{t('mortgages.card.currentBalance')}</p><p className={`text-[1.3rem] font-semibold tracking-[-0.04em] ${appTextStrongClass}`}>{formatMortgageBalanceAmount(details.currentMortgageBalance)}</p>{mortgageLtv !== null ? <><p className={`mt-1 text-[11px] ${appTextMutedClass}`}>{formatPercentage(mortgageLtv, 1)} LTV</p><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(mortgageLtv, 100)}%` }} /></div></> : null}</div><div className="divide-y divide-[var(--app-border)]">{[{ label: t('mortgages.card.monthlyPayment'), value: formatMortgageOperatingAmount(details.monthlyMortgagePayment) }, { label: t('properties.mortgageImpact.interestRate'), value: mortgageRateValue !== null ? `${formatPercentage(mortgageRateValue, 2)} ${mortgageRateTypeLabel}` : t('common.notSpecified') }, { label: t('properties.mortgageImpact.remainingTerm'), value: mortgageRemainingTermLabel }].map((row) => <div key={row.label} className="flex items-center justify-between gap-3 py-1.5 text-[12px]"><span className={appTextMutedClass}>{row.label}</span><span className={`text-right font-semibold ${appTextStrongClass}`}>{row.value}</span></div>)}</div></div>{details.unverifiedMortgageBalance > 0 ? <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{isSpanish ? `Saldo hipotecario pendiente no verificable: ${formatMortgageBalanceAmount(details.unverifiedMortgageBalance)}. Excluido de deuda activa, LTV y equity.` : `Unverified outstanding mortgage balance: ${formatMortgageBalanceAmount(details.unverifiedMortgageBalance)}. Excluded from active debt, LTV, and equity.`}</p> : null}</> : <p className={`mt-3 text-[13px] ${appTextMutedClass}`}>{mortgageEmptyTitle}</p>}</div>
            <div className={`${nestedPanelClass} ${cardPaddingClass}`}><div className="flex items-center justify-between gap-3"><h3 className={sectionTitleClass}>{t('nav.documents')}</h3><button type="button" onClick={() => setActiveTab('documents')} className={`text-[11px] font-medium text-[var(--app-nav-active-fg)]`}>{t('propertiesUi.viewAll')} <ChevronRight className="inline h-3.5 w-3.5" /></button></div>{uploadedDocuments.length > 0 ? <div className="mt-2 divide-y divide-[var(--app-border)]">{uploadedDocuments.slice(0, 3).map((document) => <button key={document.id} type="button" onClick={() => setActiveTab('documents')} className="flex w-full items-center gap-3 py-2 text-left"><FileText className="h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--app-text-strong)]">{document.name}</span><span className={`shrink-0 text-[11px] ${appTextMutedClass}`}>{document.uploadedAt ? formatLanguageDate(document.uploadedAt) : document.typeLabel}</span></button>)}</div> : <p className={`mt-3 text-[13px] ${appTextMutedClass}`}>{t('propertiesUi.noDocumentsUploaded')}</p>}</div>
          </section>
        </div>
      ) : null}
      {false && activeTab === 'overview' ? (
        <div>
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.95fr)]">
              <div className={`${nestedPanelClass} p-4`}>
                {renderSectionHeader(isSpanish ? 'Resumen del activo' : 'Asset overview', 'basic-info')}
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[var(--app-border)] bg-white px-3.5 py-3.5">
                    <p className={labelClass}>{t('properties.labels.propertyType')}</p>
                    <p className={valueClass}>{localizedPropertyType || t('common.notSpecified')}</p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--app-border)] bg-white px-3.5 py-3.5">
                    <p className={labelClass}>{t('properties.labels.purchaseDate')}</p>
                    <p className={valueClass}>
                      {property.purchaseDate ? formatLanguageDate(property.purchaseDate) : t('common.notSpecified')}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--app-border)] bg-white px-3.5 py-3.5 sm:col-span-2">
                    <p className={labelClass}>{isSpanish ? 'Direccion' : 'Address'}</p>
                    <p className={valueClass}>{[property.address, property.city, localizedCountry].filter(Boolean).join(', ') || t('common.notSpecified')}</p>
                  </div>
                </div>
              </div>

              <div className={`${nestedPanelClass} p-4`}>
                {renderSectionHeader(t('dashboard.cashflowAndReturns'), 'cashflow')}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[22px] border border-[var(--app-border)] bg-white px-4 py-4">
                    <p className={labelClass}>{isSpanish ? 'Ingresos y gastos' : 'Income and expenses'}</p>
                    <div className="mt-3 space-y-3">
                      {operatingSummaryMetrics.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4">
                          <span className={`text-sm ${appTextMutedClass}`}>{item.label}</span>
                          <span className={`text-[15px] font-semibold tracking-[-0.02em] ${item.tone}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-[var(--app-border)] bg-white px-4 py-4">
                    <p className={labelClass}>{isSpanish ? 'Patrimonio y rentabilidad' : 'Equity and returns'}</p>
                    <div className="mt-3 space-y-3">
                      {patrimonySummaryMetrics.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4">
                          <span className={`text-sm ${appTextMutedClass}`}>{item.label}</span>
                          <span className={`text-[15px] font-semibold tracking-[-0.02em] ${item.tone}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className={`mt-4 text-sm leading-6 ${appTextMutedClass}`}>{t('properties.labels.roceFormula')}</p>
                  </div>
                </div>
              </div>

              <div className={`${nestedPanelClass} p-5`}>
                {renderSectionHeader(t('properties.labels.mortgage'), 'mortgage', undefined, false)}
                {mortgage || property.hasMortgage ? (
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className={appTextMutedClass}>{t('mortgages.card.currentBalance')}</span>
                      <span className={`font-semibold ${appTextStrongClass}`}>{formatMortgageBalanceAmount(details.currentMortgageBalance)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={appTextMutedClass}>{t('mortgages.card.monthlyPayment')}</span>
                      <span className={`font-semibold ${appTextStrongClass}`}>{formatMortgageOperatingAmount(details.monthlyMortgagePayment)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={appTextMutedClass}>{t('properties.form.annualPrincipalAmortized')}</span>
                      <span className={`font-semibold ${successValueClass}`}>{formatMortgageOperatingAmount(details.annualPrincipalAmortized)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-[var(--app-border)] bg-white px-4 py-5">
                    <p className={`text-sm font-medium ${appTextStrongClass}`}>{mortgageEmptyTitle}</p>
                    <p className={`mt-1 text-sm leading-6 ${appTextMutedClass}`}>{mortgageEmptyBody}</p>
                  </div>
                )}
              </div>
            </div>
            {activeLease != null ? (
              <div className={`mt-5 ${nestedPanelClass} p-5`}>
                {renderSectionHeader(isSpanish ? 'Renta y contrato' : 'Rent and lease', 'lease-rent-rule')}
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <p className={labelClass}>{isSpanish ? 'Renta actual' : 'Current rent'}</p>
                    <p className={`mt-1 font-semibold ${successValueClass}`}>{formatOperatingAmount(activeLease!.monthlyRent ?? 0, rentCurrency)}</p>
                  </div>
                  <div>
                    <p className={labelClass}>{isSpanish ? 'Fianza' : 'Deposit'}</p>
                    <p className={`mt-1 font-semibold ${appTextStrongClass}`}>
                      {activeLease!.securityDeposit != null
                        ? formatOperatingAmount(activeLease!.securityDeposit ?? 0, depositCurrency)
                        : t('common.notSpecified')}
                    </p>
                  </div>
                  <div>
                    <p className={labelClass}>{isSpanish ? 'Recargo por demora' : 'Late fee'}</p>
                    <p className={`mt-1 font-semibold ${appTextStrongClass}`}>
                      {activeLease!.lateFeeAmount != null
                        ? formatOperatingAmount(activeLease!.lateFeeAmount ?? 0, lateFeeCurrency)
                        : t('common.notSpecified')}
                    </p>
                  </div>
                  <div>
                    <p className={labelClass}>{taxSummaryLabels.nextRentUpdate}</p>
                    <p className={`mt-1 font-semibold ${appTextStrongClass}`}>
                      {nextLeaseUpdateDate ? formatLanguageDate(nextLeaseUpdateDate) : t('common.notSpecified')}
                    </p>
                  </div>
                  <div>
                    <p className={labelClass}>{taxSummaryLabels.rentUpdateRule}</p>
                    <p className={`mt-1 font-semibold ${appTextStrongClass}`}>{rentRuleSummary || t('common.notSpecified')}</p>
                  </div>
                  <div>
                    <p className={labelClass}>{taxSummaryLabels.actual12mExpenses}</p>
                    <p className={`mt-1 font-semibold ${warningValueClass}`}>
                      {formatOperatingAmount(details.actualTrailing12MonthsExpenses)}
                    </p>
                  </div>
                  <div>
                    <p className={labelClass}>{taxSummaryLabels.projected12mExpenses}</p>
                    <p className={`mt-1 font-semibold ${appTextStrongClass}`}>
                      {formatOperatingAmount(details.projectedNext12MonthsExpenses)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className={appPanelInsetClass}>
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-right">Renta anterior</th>
                        <th className="px-3 py-2 text-right">Nueva renta</th>
                        <th className="px-3 py-2 text-right">{taxSummaryLabels.appliedPercent}</th>
                        <th className="px-3 py-2 text-left">{taxSummaryLabels.index}</th>
                        <th className="px-3 py-2 text-left">Fuente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaseHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className={`px-3 py-4 text-center ${appTextMutedClass}`}>
                            {taxSummaryLabels.noRentAdjustments}
                          </td>
                        </tr>
                      ) : (
                        leaseHistory.map((entry) => (
                          <tr key={entry.id} className={`border-t ${appBorderClass}`}>
                            <td className="px-3 py-2">{formatLanguageDate(entry.adjustmentDate)}</td>
                            <td className="px-3 py-2 text-right">{formatOperatingAmount(entry.previousRent, rentCurrency)}</td>
                            <td className="px-3 py-2 text-right">{formatOperatingAmount(entry.newRent, rentCurrency)}</td>
                            <td className="px-3 py-2 text-right">{formatPercentage(entry.percentageApplied)}</td>
                            <td className="px-3 py-2">{entry.indexUsed ? entry.indexUsed.toUpperCase() : '—'}</td>
                            <td className="px-3 py-2">{entry.ruleSource}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'finances' ? (
        <div className="space-y-4 px-5 py-5">
          <div className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.9)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.96))] shadow-[0_14px_34px_-30px_rgba(15,23,42,0.10)]">
            <div className="grid grid-cols-1 divide-y divide-[rgba(226,232,240,0.72)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-[1.34fr_0.98fr_0.98fr_1.08fr]">
              {financeKpis.map((metric) => {
                const Icon = metric.icon;
                const iconToneClass =
                  metric.tone === 'warning'
                    ? 'bg-amber-50/80 text-amber-500'
                    : metric.tone === 'info'
                    ? 'bg-cyan-50/80 text-cyan-500'
                    : 'bg-emerald-50/80 text-emerald-500';

                return (
                  <div
                    key={metric.label}
                    className={`flex min-h-[104px] items-center gap-3 px-5 py-5 xl:px-6 ${
                      metric.emphasis === 'primary'
                        ? 'bg-[linear-gradient(180deg,#fbfffd_0%,#ffffff_100%)]'
                        : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(253,254,255,0.92))]'
                    }`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${iconToneClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[11px] font-medium tracking-[-0.01em] ${appTextMutedClass}`}>
                        {metric.label}
                      </p>
                      <p
                        className={`mt-2 font-semibold tracking-[-0.055em] ${
                          metric.emphasis === 'primary'
                            ? `text-[2.05rem] ${details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass}`
                            : metric.tone === 'warning'
                            ? `text-[1.5rem] text-emerald-700 dark:text-emerald-300`
                            : metric.tone === 'info'
                            ? `text-[1.5rem] ${accentValueClass}`
                            : `text-[1.5rem] ${successValueClass}`
                        }`}
                      >
                        {metric.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_318px_286px] xl:items-stretch">
            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(251,252,254,0.96))] shadow-[0_14px_34px_-30px_rgba(15,23,42,0.10)]">
              <div className="border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {t('properties.labels.cashflow')}
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[minmax(282px,0.9fr)_minmax(0,1fr)] lg:items-center">
                <div className="flex flex-col items-center justify-center">
                  <div className="relative mx-auto aspect-square w-full max-w-[348px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData.filter((segment) => segment.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={82}
                          outerRadius={126}
                          paddingAngle={3}
                          stroke="#ffffff"
                          strokeWidth={4}
                        >
                          {pieData.filter((segment) => segment.value > 0).map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
                      <p className={`max-w-[150px] text-[11px] font-medium leading-4 ${appTextMutedClass}`}>
                        {t('properties.form.netMonthlyCashflow')}
                      </p>
                      <p
                        className={`mt-2 text-[2.2rem] font-semibold tracking-[-0.065em] ${
                          details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass
                        }`}
                      >
                        {formatOperatingAmount(details.netMonthlyCashflow)}
                      </p>
                      <p className={`mt-2 text-[12px] leading-4 ${appTextMutedClass}`}>
                        {formatOperatingAmount(details.monthlyRent)} in · {formatOperatingAmount(details.totalMonthlyExpenses)} out
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {breakdownCards.map((card) => (
                    <div
                      key={card.label}
                      className={`rounded-[18px] border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] ${
                        card.emphasis === 'major'
                          ? 'min-h-[74px]'
                          : card.emphasis === 'strongOutflow'
                          ? 'min-h-[66px]'
                          : 'min-h-[64px]'
                      }`}
                      style={{ backgroundColor: card.surface, borderColor: card.border }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-3 w-3 shrink-0 rounded-full ${chartDotRingClass}`}
                              style={{ backgroundColor: card.color }}
                            />
                            <p
                              className={`truncate text-[0.98rem] font-medium tracking-[-0.02em] ${
                                card.emphasis === 'major' || card.emphasis === 'strongOutflow'
                                  ? appTextStrongClass
                                  : 'text-slate-600'
                              }`}
                            >
                              {card.label}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center gap-2 pl-5">
                            <span className="text-[12px] text-slate-500">{card.percentage}</span>
                            <span className="text-[12px] text-slate-500">{card.amountShare}</span>
                          </div>
                        </div>
                        <p
                          className={`shrink-0 text-right font-semibold tracking-[-0.04em] ${
                            card.emphasis === 'major' ? `text-[1.28rem] ${card.valueClass}` : `text-[1.08rem] ${card.valueClass}`
                          }`}
                        >
                          {card.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,252,254,0.95))] shadow-[0_14px_32px_-30px_rgba(15,23,42,0.10)]">
              <div className="border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {isSpanish ? 'Cashflow Breakdown' : 'Cashflow Breakdown'}
                </h4>
              </div>
              <div className="grid gap-2.5 px-4 py-4">
                {breakdownCards.map((card) => (
                  <div
                    key={`${card.label}-compact`}
                    className="flex items-center justify-between gap-3 rounded-[14px] border px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
                    style={{ backgroundColor: card.surface, borderColor: card.border }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${chartDotRingClass}`}
                          style={{ backgroundColor: card.color }}
                        />
                        <p className={`truncate text-[0.86rem] font-medium tracking-[-0.015em] ${appTextStrongClass}`}>
                          {card.label}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-[1rem] font-semibold tracking-[-0.035em] ${card.valueClass}`}>{card.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.95))] shadow-[0_14px_30px_-30px_rgba(15,23,42,0.10)]">
              <div className="border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  Cashflow Snapshot
                </h4>
              </div>
              <div className="px-5 py-4">
                <div className="space-y-3">
                  {snapshotRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[rgba(226,232,240,0.72)] pb-3 last:border-b-0 last:pb-0">
                      <span className={`text-[0.95rem] ${appTextMutedClass}`}>{row.label}</span>
                      <span className={`text-[0.98rem] font-semibold tracking-[-0.03em] ${row.valueClass}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-[rgba(226,232,240,0.82)] pt-4">
                  <div className="rounded-[18px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-[1rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>
                          {t('properties.form.netMonthlyCashflow')}
                        </p>
                        <p className={`mt-0.5 text-[12px] ${details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass}`}>
                          {formatPercentage(details.monthlyRent > 0 ? (details.netMonthlyCashflow / details.monthlyRent) * 100 : 0, 1)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-[1.7rem] font-semibold tracking-[-0.055em] ${
                            details.netMonthlyCashflow >= 0 ? successValueClass : dangerValueClass
                          }`}
                        >
                          {formatOperatingAmount(details.netMonthlyCashflow)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[18px] border border-[rgba(209,228,255,0.9)] bg-[linear-gradient(180deg,rgba(242,247,255,0.98),rgba(255,255,255,0.98))] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-[0.98rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>
                          Cashflow after taxes
                        </p>
                        <p className={`mt-1 text-[11px] ${cashflowAfterTaxesRow.helperTextClass}`}>
                          {cashflowAfterTaxesRow.helperText}
                        </p>
                      </div>
                      <p className={`text-right text-[1.02rem] font-semibold tracking-[-0.03em] ${cashflowAfterTaxesRow.valueClass}`}>
                        {cashflowAfterTaxesRow.value}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.98fr_1.1fr_0.9fr]">
            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.95))] shadow-[0_14px_32px_-30px_rgba(15,23,42,0.10)]">
              <div className="border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {t('properties.labels.investmentSummary')}
                </h4>
              </div>
              <div className="px-5 py-3">
                {investmentSummaryRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 border-b border-[rgba(226,232,240,0.72)] py-3 last:border-b-0 last:pb-1"
                  >
                    <span className={`text-[0.98rem] ${row.emphasize ? appTextStrongClass : appTextMutedClass}`}>{row.label}</span>
                    <span
                      className={`text-right font-semibold tracking-[-0.04em] ${
                        row.emphasize ? `text-[1.42rem] ${row.valueClass}` : `text-[1.08rem] ${row.valueClass}`
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.95))] shadow-[0_14px_32px_-30px_rgba(15,23,42,0.10)]">
              <div className="border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {t('properties.labels.profitabilityAndReturns')}
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-px bg-[rgba(241,245,249,0.88)] sm:grid-cols-2">
                {returnMetricRows.map((metric) => {
                  const Icon = metric.icon;

                  return (
                    <div key={metric.label} className="flex items-start gap-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(252,253,255,0.95))] px-5 py-4">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-slate-50/75 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                          {metric.label}
                        </p>
                        <p className={`mt-2 text-[1.3rem] font-semibold tracking-[-0.05em] ${metric.valueClass}`}>
                          {metric.value}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.95))] shadow-[0_14px_32px_-30px_rgba(15,23,42,0.10)]">
              <div className="border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {t('dashboard.propertyEngine')}
                </h4>
              </div>
              <div className="px-5 py-4">
                <div className="rounded-[18px] border border-[rgba(209,234,223,0.95)] bg-[linear-gradient(180deg,#fbfffd_0%,#ffffff_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                        {t('dashboard.annualValueCreation')}
                      </p>
                    </div>
                    <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  </div>
                  <p className={`mt-3 text-[2rem] font-semibold tracking-[-0.06em] ${successValueClass}`}>
                    {formatValuationAmount(annualValueCreation)}
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {propertyEngineRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[rgba(226,232,240,0.72)] pb-3 last:border-b-0 last:pb-0">
                      <span className={`text-[0.98rem] ${appTextMutedClass}`}>{row.label}</span>
                      <span className={`text-[1.06rem] font-semibold tracking-[-0.035em] ${appTextStrongClass}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.95))] shadow-[0_14px_32px_-30px_rgba(15,23,42,0.10)]">
              <div className="flex items-center gap-3 border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/80 bg-amber-50/75 text-amber-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <Coins className="h-4.5 w-4.5" />
                </div>
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {t('properties.labels.operatingExpenses')}
                </h4>
              </div>
              <div className="px-5 py-3">
                {operatingExpenseRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[rgba(226,232,240,0.72)] py-3 last:border-b-0">
                    <span className={`text-[0.98rem] ${appTextMutedClass}`}>{row.label}</span>
                    <span className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{row.value}</span>
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(241,230,201,0.9)] bg-amber-50/45 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4.5 w-4.5 text-amber-500" />
                    <span className={`text-[0.9rem] font-medium ${appTextStrongClass}`}>{t('properties.form.totalOperatingExpenses')}</span>
                  </div>
                  <span className={`text-[1.1rem] font-semibold tracking-[-0.04em] ${warningValueClass}`}>
                    {formatOperatingAmount(details.annualOperatingExpenses)}
                  </span>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[24px] border border-[rgba(226,232,240,0.82)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,253,255,0.95))] shadow-[0_14px_32px_-30px_rgba(15,23,42,0.10)]">
              <div className="flex items-center gap-3 border-b border-[rgba(226,232,240,0.72)] px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/80 bg-sky-50/75 text-sky-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <Shield className="h-4.5 w-4.5" />
                </div>
                <h4 className={`text-[1.02rem] font-semibold tracking-[-0.025em] ${appTextStrongClass}`}>
                  {t('properties.labels.insurance')}
                </h4>
              </div>
              <div className="px-5 py-3">
                {insuranceRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 border-b border-[rgba(226,232,240,0.72)] py-3 last:border-b-0">
                    <span className={`text-[0.98rem] ${appTextMutedClass}`}>{row.label}</span>
                    <span className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{row.value}</span>
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(219,234,254,0.95)] bg-sky-50/45 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4.5 w-4.5 text-sky-500" />
                    <span className={`text-[0.9rem] font-medium ${appTextStrongClass}`}>{t('properties.form.totalInsuranceCost')}</span>
                  </div>
                  <span className={`text-[1.1rem] font-semibold tracking-[-0.04em] ${infoValueClass}`}>
                    {formatOperatingAmount(details.annualInsuranceExpenses)}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === 'mortgage' ? (
        <div className="space-y-5 px-5 py-5">
          <div className="space-y-4">
            <div className={`${nestedPanelClass} px-4 py-4 sm:px-5 sm:py-5`}>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-[rgba(31,79,136,0.08)] p-2.5 text-[var(--app-nav-active-fg)]">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <h3 className={`text-[1.35rem] font-semibold tracking-[-0.04em] ${appTextStrongClass} sm:text-[1.55rem]`}>
                    {t('properties.mortgageImpact.title')}
                  </h3>
                  <p className={`mt-1 max-w-2xl text-sm leading-6 ${appTextMutedClass}`}>
                    {t('properties.mortgageImpact.subtitle')}
                  </p>
                </div>
              </div>
            </div>

            {mortgage || property.hasMortgage ? (
              <>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.18fr)]">
                  <section className={`${nestedPanelClass} px-4 py-4 sm:px-5 sm:py-5`}>
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-2xl bg-[rgba(14,165,233,0.09)] p-2 text-sky-600 dark:text-sky-300">
                        <Shield className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                          {t('properties.mortgageImpact.overviewTitle')}
                        </p>
                        <p className={`mt-0.5 text-[12px] ${appTextMutedClass}`}>
                          {mortgageLenderLabel}
                        </p>
                      </div>
                    </div>

                    <div className={`mt-4 divide-y ${appBorderClass}`}>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <p className={`text-[0.92rem] ${appTextMutedClass}`}>{t('properties.form.lenderName')}</p>
                        <p className={`text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageLenderLabel}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <p className={`text-[0.92rem] ${appTextMutedClass}`}>{t('mortgages.card.currentBalance')}</p>
                        <p className={`text-[1.1rem] font-semibold tracking-[-0.04em] ${appTextStrongClass}`}>{formatMortgageBalanceAmount(details.currentMortgageBalance)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <p className={`text-[0.92rem] ${appTextMutedClass}`}>{t('mortgages.card.monthlyPayment')}</p>
                        <p className={`text-[1.1rem] font-semibold tracking-[-0.04em] ${appTextStrongClass}`}>{formatMortgageOperatingAmount(details.monthlyMortgagePayment)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <p className={`text-[0.92rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.interestRate')}</p>
                        <p className={`text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                          {mortgageRateValue !== null ? formatPercentage(mortgageRateValue, 2) : t('common.notSpecified')}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-3">
                        <p className={`text-[0.92rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.remainingTerm')}</p>
                        <p className={`text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageRemainingTermLabel}</p>
                      </div>
                    </div>
                  </section>

                  <section className={`${nestedPanelClass} px-4 py-4 sm:px-5 sm:py-5`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-2xl bg-[rgba(16,185,129,0.09)] p-2 text-emerald-600 dark:text-emerald-300">
                          <TrendingUp className="h-4.5 w-4.5" />
                        </div>
                        <p className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                          {t('properties.mortgageImpact.impactTitle')}
                        </p>
                      </div>
                      <div className={`hidden rounded-full border px-3 py-1 text-[11px] font-medium sm:inline-flex ${appBorderClass} ${appTextMutedClass}`}>
                        {t('properties.mortgageImpact.impactBadge')}
                      </div>
                    </div>

                    <div className={`mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:divide-x ${appBorderClass}`}>
                      <div className="space-y-3 md:pr-4">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                          {t('properties.mortgageImpact.monthlyColumn')}
                        </p>
                        <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white/75 px-4 py-3">
                          <p className={`text-[0.86rem] ${appTextMutedClass}`}>{t('properties.form.monthlyMortgageInterest')}</p>
                          <p className={`mt-1 text-[1.35rem] font-semibold tracking-[-0.04em] ${warningValueClass}`}>
                            {formatMortgageOperatingAmount(details.monthlyMortgageInterest)}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white/75 px-4 py-3">
                          <p className={`text-[0.86rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.monthlyPrincipal')}</p>
                          <p className={`mt-1 text-[1.35rem] font-semibold tracking-[-0.04em] ${successValueClass}`}>
                            {formatMortgageOperatingAmount(details.monthlyPrincipalAmortized)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 md:pl-4">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                          {t('properties.mortgageImpact.annualColumn')}
                        </p>
                        <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white/75 px-4 py-3">
                          <p className={`text-[0.86rem] ${appTextMutedClass}`}>{t('properties.form.annualMortgageInterest')}</p>
                          <p className={`mt-1 text-[1.35rem] font-semibold tracking-[-0.04em] ${warningValueClass}`}>
                            {formatMortgageOperatingAmount(details.annualMortgageInterest)}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white/75 px-4 py-3">
                          <p className={`text-[0.86rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.annualPrincipalPaydown')}</p>
                          <p className={`mt-1 text-[1.35rem] font-semibold tracking-[-0.04em] ${successValueClass}`}>
                            {formatMortgageOperatingAmount(details.annualPrincipalAmortized)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`mt-4 rounded-[18px] border px-4 py-3 ${appBorderClass} bg-[rgba(248,250,252,0.9)]`}>
                      <p className={`text-[0.94rem] ${appTextStrongClass}`}>{mortgageRentBurdenLabel}</p>
                    </div>
                  </section>
                </div>

                <section className={`${nestedPanelClass} px-4 py-4 sm:px-5 sm:py-5`}>
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_280px]">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-2xl bg-[rgba(20,184,166,0.09)] p-2 text-teal-600 dark:text-teal-300">
                          <Coins className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <p className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                            {t('properties.mortgageImpact.equityTitle')}
                          </p>
                          <p className={`mt-0.5 text-[12px] ${appTextMutedClass}`}>
                            {t('properties.mortgageImpact.equitySubtitle')}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className={`rounded-[18px] border px-4 py-3 ${appBorderClass}`}>
                          <p className={`text-[0.8rem] ${appTextMutedClass}`}>{t('properties.form.lenderName')}</p>
                          <p className={`mt-1 text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageLenderLabel}</p>
                        </div>
                        <div className={`rounded-[18px] border px-4 py-3 ${appBorderClass}`}>
                          <p className={`text-[0.8rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.mortgageType')}</p>
                          <p className={`mt-1 text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageTypeLabel}</p>
                        </div>
                        <div className={`rounded-[18px] border px-4 py-3 ${appBorderClass}`}>
                          <p className={`text-[0.8rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.rateStructure')}</p>
                          <p className={`mt-1 text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageRateTypeLabel}</p>
                        </div>
                        <div className={`rounded-[18px] border px-4 py-3 ${appBorderClass}`}>
                          <p className={`text-[0.8rem] ${appTextMutedClass}`}>{t('properties.mortgageImpact.remainingTerm')}</p>
                          <p className={`mt-1 text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageRemainingTermLabel}</p>
                        </div>
                      </div>

                      <div className={`mt-4 rounded-[18px] border px-4 py-3 ${appBorderClass} bg-[rgba(248,250,252,0.9)]`}>
                        <p className={`text-sm leading-6 ${appTextMutedClass}`}>{mortgageProfileLabel}</p>
                      </div>
                    </div>

                    <div className="flex">
                      <div className="w-full rounded-[22px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(248,250,252,0.96))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                        <p className={`text-[0.78rem] font-semibold uppercase tracking-[0.2em] ${appTextSoftClass}`}>
                          {t('properties.mortgageImpact.equityHighlightLabel')}
                        </p>
                        <p className={`mt-3 text-[2rem] font-semibold tracking-[-0.05em] ${successValueClass}`}>
                          {formatMortgageOperatingAmount(details.annualPrincipalAmortized)}
                        </p>
                        <p className={`mt-3 text-sm leading-6 ${appTextMutedClass}`}>
                          {t('properties.mortgageImpact.equityHighlightBody', {
                            amount: formatMortgageOperatingAmount(details.annualPrincipalAmortized),
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <div className={`${nestedPanelClass} px-4 py-5 sm:px-5 sm:py-6`}>
                <div className="rounded-[22px] border border-dashed border-[var(--app-border)] bg-white/75 px-4 py-5">
                  <p className={`text-base font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>{mortgageEmptyTitle}</p>
                  <p className={`mt-1.5 max-w-xl text-sm leading-6 ${appTextMutedClass}`}>{mortgageEmptyBody}</p>
                  <button
                    type="button"
                    onClick={() => onEdit(property, 'mortgage')}
                    className={`mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
                  >
                    <Edit className="h-4 w-4" />
                    <span>{t('properties.mortgageImpact.addMortgage')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {activeTab === 'documents' ? (
        <div className="space-y-5 px-5 py-5">
          {uploadedDocuments.length === 0 ? (
            renderDocumentsEmptyState()
          ) : (
            <>
              <div className={`${nestedPanelClass} overflow-hidden`}>
                <div className="border-b border-slate-200/70 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                      <h3 className={`text-[1.75rem] font-semibold tracking-[-0.05em] ${appTextStrongClass}`}>
                        {isSpanish ? 'Documentos' : 'Documents'}
                      </h3>
                      <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                        {isSpanish
                          ? 'Almacena contratos, archivos hipotecarios, facturas, polizas, recibos fiscales y otros registros operativos del inmueble.'
                          : 'Store contracts, mortgage files, invoices, insurance records, tax receipts, and other operational property records here.'}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 text-[12px] font-medium text-slate-600">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>
                        {isSpanish
                          ? 'Centro documental presentacional'
                          : 'Presentational document hub'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 px-6 py-5">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    {renderCompactStatCard(
                      isSpanish ? 'Archivos totales' : 'Total files',
                      String(uploadedDocuments.length),
                      filteredDocumentsCount !== allDocumentRows.length
                        ? isSpanish
                          ? `${filteredDocumentsCount} visibles en este filtro`
                          : `${filteredDocumentsCount} visible in this filter`
                        : undefined
                    )}
                    {renderCompactStatCard(
                      isSpanish ? 'Criticos pendientes' : 'Missing critical docs',
                      String(missingCriticalDocumentsCount),
                      isSpanish ? 'Segun el contexto del inmueble' : 'Based on this property context',
                      missingCriticalDocumentsCount > 0 ? warningValueClass : successValueClass
                    )}
                    {renderCompactStatCard(
                      isSpanish ? 'Ultima carga' : 'Last upload',
                      formatRelativeUpload(lastUploadedAt),
                      lastUploadedAt ? formatDocumentDate(lastUploadedAt) : undefined,
                      infoValueClass
                    )}
                    {renderCompactStatCard(
                      isSpanish ? 'Categorias usadas' : 'Categories used',
                      String(categoriesUsedCount),
                      isSpanish ? 'Sobre archivos cargados' : 'Across uploaded files',
                      accentValueClass
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDocumentCategory('all')}
                      className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition ${
                        selectedDocumentCategory === 'all'
                          ? 'border-[rgba(31,79,136,0.14)] bg-[rgba(31,79,136,0.08)] text-[var(--app-nav-active-fg)]'
                          : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
                      }`}
                    >
                      {isSpanish ? 'Todas' : 'All'}
                      <span className="ml-1.5 text-[11px] opacity-70">{allDocumentRows.length}</span>
                    </button>
                    {documentCategoryMeta.map((item) => {
                      const isActive = selectedDocumentCategory === item.key;
                      const count = documentCountsByCategory[item.key];

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedDocumentCategory(item.key)}
                          className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition ${
                            isActive
                              ? 'border-[rgba(31,79,136,0.14)] bg-[rgba(31,79,136,0.08)] text-[var(--app-nav-active-fg)]'
                              : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
                          }`}
                        >
                          {item.label}
                          {count > 0 ? <span className="ml-1.5 text-[11px] opacity-70">{count}</span> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-[22px] border border-slate-200/75 bg-white px-5 py-5 shadow-[0_20px_40px_-36px_rgba(15,23,42,0.12)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                          {isSpanish ? 'Documentos criticos' : 'Critical Documents'}
                        </p>
                        <p className={`mt-1 text-sm ${appTextMutedClass}`}>
                          {isSpanish
                            ? 'La prioridad se adapta a si hay hipoteca, alquiler o cobertura activa.'
                            : 'Priority adapts to mortgage, rental, and insurance context.'}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600">
                        {isSpanish ? 'Sin flujo de carga todavia' : 'No upload flow yet'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {criticalDocuments.map((item) => {
                        const statusMeta = getDocumentStatusMeta(item.status);

                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 rounded-[18px] border border-slate-200/75 bg-[var(--app-panel-inset)] px-4 py-3.5"
                          >
                            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-slate-200/70 bg-white text-slate-500">
                              {item.category === 'legal' ? (
                                <Landmark className="h-5 w-5" />
                              ) : item.category === 'mortgage' ? (
                                <Receipt className="h-5 w-5" />
                              ) : item.category === 'insurance' ? (
                                <Shield className="h-5 w-5" />
                              ) : (
                                <FileText className="h-5 w-5" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`text-sm font-semibold ${appTextStrongClass}`}>{item.name}</p>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              <p className={`mt-1 text-[12px] ${appTextMutedClass}`}>
                                {getDocumentCategoryLabel(item.category)} · {item.supportingText}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200/75 bg-white shadow-[0_20px_40px_-36px_rgba(15,23,42,0.12)]">
                    <div className="border-b border-slate-200/70 px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-[1rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                            {isSpanish ? 'Todos los documentos' : 'All Documents'}
                          </p>
                          <p className={`mt-1 text-sm ${appTextMutedClass}`}>
                            {isSpanish
                              ? 'Listado completo de archivos cargados y sugerencias activas para esta propiedad.'
                              : 'Full list of uploaded files and active suggestions for this property.'}
                          </p>
                        </div>
                        <div className={`inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-[var(--app-panel-inset)] px-3 py-1.5 text-[12px] ${appTextMutedClass}`}>
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>{filteredDocumentsCount}</span>
                        </div>
                      </div>
                    </div>

                    {filteredDocumentRows.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200/70 bg-[var(--app-panel-inset)] text-left">
                              <th className={`px-5 py-3 text-[12px] font-medium ${appTextMutedClass}`}>
                                {isSpanish ? 'Archivo' : 'File name'}
                              </th>
                              <th className={`px-5 py-3 text-[12px] font-medium ${appTextMutedClass}`}>
                                {isSpanish ? 'Categoria' : 'Category'}
                              </th>
                              <th className={`px-5 py-3 text-[12px] font-medium ${appTextMutedClass}`}>
                                {isSpanish ? 'Tipo' : 'Type'}
                              </th>
                              <th className={`px-5 py-3 text-[12px] font-medium ${appTextMutedClass}`}>
                                {isSpanish ? 'Fecha de carga' : 'Date uploaded'}
                              </th>
                              <th className={`px-5 py-3 text-[12px] font-medium ${appTextMutedClass}`}>
                                {isSpanish ? 'Acciones' : 'Actions'}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDocumentRows.map((item) => {
                              const statusMeta = getDocumentStatusMeta(item.status);

                              return (
                                <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                                  <td className="px-5 py-3.5 align-top">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200/70 bg-[var(--app-panel-inset)] text-slate-500">
                                        <FileText className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className={`truncate text-sm font-medium ${appTextStrongClass}`}>{item.name}</p>
                                        <p className={`mt-1 text-[12px] ${appTextMutedClass}`}>{item.sourceLabel}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5 align-top">
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                      {getDocumentCategoryLabel(item.category)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3.5 align-top">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`text-sm ${appTextStrongClass}`}>{item.typeLabel}</span>
                                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusMeta.className}`}>
                                        {statusMeta.label}
                                      </span>
                                    </div>
                                  </td>
                                  <td className={`px-5 py-3.5 align-top text-sm ${appTextMutedClass}`}>
                                    {item.status === 'uploaded'
                                      ? formatDocumentDate(item.uploadedAt)
                                      : isSpanish
                                      ? 'Pendiente'
                                      : 'Pending'}
                                  </td>
                                  <td className="px-5 py-3.5 align-top">
                                    {item.url ? (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium ${appButtonMutedClass} ${appTextMutedClass}`}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        <span>{isSpanish ? 'Abrir' : 'Open'}</span>
                                      </a>
                                    ) : (
                                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium ${appButtonMutedClass} ${appTextMutedClass}`}>
                                        <Clock3 className="h-3.5 w-3.5" />
                                        <span>{isSpanish ? 'Solo sugerencia' : 'Suggestion only'}</span>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-5 py-8 text-center">
                        <FolderOpen className="mx-auto h-7 w-7 text-slate-400" />
                        <p className={`mt-3 text-sm font-medium ${appTextStrongClass}`}>
                          {isSpanish ? 'No hay documentos en esta categoria' : 'No documents in this category'}
                        </p>
                        <p className={`mt-1 text-sm ${appTextMutedClass}`}>
                          {isSpanish
                            ? 'Prueba con otro filtro o sube un archivo administrativo.'
                            : 'Try another filter or upload an administrative file.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {suggestedDocuments.length > 0 ? (
                <div className={`${nestedPanelClass} px-5 py-4`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <p className={`text-[0.98rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                      {isSpanish ? 'Sugerencias contextuales' : 'Contextual suggestions'}
                    </p>
                  </div>
                  <p className={`mt-1.5 text-sm leading-6 ${appTextMutedClass}`}>
                    {isSpanish
                      ? 'Solo se muestran sugerencias relevantes para esta propiedad. No se marcan como obligatorias si no hay hipoteca o alquiler.'
                      : 'Only relevant suggestions are shown for this property. They are not treated as required when there is no mortgage or rental context.'}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {activeTab === 'taxes' ? (
        <div className="space-y-4 px-5 py-5">
          <div className={`${nestedPanelClass} overflow-hidden border border-[rgba(31,79,136,0.08)] bg-[linear-gradient(180deg,rgba(240,246,255,0.9),rgba(255,255,255,0.98))] px-3.5 py-2.5 sm:px-4 sm:py-3`}>
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-[rgba(31,79,136,0.1)] bg-white p-1.5 text-[var(--app-nav-active-fg)] shadow-[0_10px_18px_-24px_rgba(31,79,136,0.45)]">
                      <Receipt className="h-3 w-3" />
                    </div>
                    <p className={`text-[0.9rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                      {taxSummaryLabels.personalTaxProfile}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {taxStatusBadges.map((badge) => (
                      <span
                        key={badge.id}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${taxBadgeToneClasses[badge.tone]}`}
                      >
                        {badge.flag ? <span className="mr-1.5">{badge.flag}</span> : null}
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onEdit(property, taxProfileEditSection)}
                  className={`inline-flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[10px] font-medium ${appButtonMutedClass} ${appTextMutedClass} hover:border-cyan-400/20 hover:text-cyan-700 dark:hover:text-cyan-300`}
                >
                  <Edit className="h-2.5 w-2.5" />
                  {taxSummaryLabels.editAssumptions}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {taxProfileItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.key} className="flex min-w-[132px] items-center gap-2">
                      <Icon className={`h-2.5 w-2.5 ${appTextMutedClass}`} />
                      <div className="min-w-0">
                        <p className={labelClass}>{item.label}</p>
                        <p className={`mt-0.5 truncate text-[0.86rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                          {item.flag ? <span className="mr-1.5">{item.flag}</span> : null}
                          {item.value}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`${nestedPanelClass} overflow-hidden px-3.5 py-3.5 sm:px-4 sm:py-4`}>
            <div>
              <p className={`text-[0.94rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                {taxSummaryLabels.taxResultFlow}
              </p>
              <p className={`mt-0.5 text-[12px] leading-4.5 ${appTextMutedClass}`}>
                {taxSummaryLabels.taxResultFlowHelp}
              </p>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1.5 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.02fr)]">
              {taxFlowCards.map((card, index) => {
                const Icon = card.icon;
                const isFinalCard = index === taxFlowCards.length - 1;

                return (
                  <React.Fragment key={card.key}>
                    <div className={`rounded-[14px] border px-2.5 py-1.5 shadow-[0_12px_24px_-30px_rgba(15,23,42,0.2)] ${card.panelClass}`}>
                      <div className={`inline-flex rounded-md bg-white/80 p-1.25 ${isFinalCard ? 'text-[var(--app-nav-active-fg)]' : card.labelToneClass}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <p className={`mt-1 text-[9.5px] font-semibold uppercase tracking-[0.11em] leading-3 ${card.labelToneClass}`}>
                        {card.label}
                      </p>
                      <p className={`mt-0.5 text-[1.24rem] font-semibold tracking-[-0.05em] leading-none ${card.valueToneClass}`}>
                        {card.value}
                      </p>
                      {card.subtext ? (
                        <p className={`mt-0.5 text-[9.5px] font-medium leading-3 ${isFinalCard ? 'text-white/80' : appTextMutedClass}`}>
                          {isFinalCard ? `${card.subtext} / month` : card.subtext}
                        </p>
                      ) : null}
                    </div>

                    {index < taxFlowCards.length - 1 ? (
                      <div className="hidden items-center justify-center xl:flex">
                        <span className={`text-[1.1rem] font-semibold ${appTextSoftClass}`}>
                          {index === taxFlowCards.length - 2 ? '=' : '-'}
                        </span>
                      </div>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>

            <div className={`${appPanelInsetClass} mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-[14px] px-2.5 py-1.5 md:grid-cols-4`}>
              {taxSummaryFacts.map((fact) => (
                <div key={fact.key}>
                  <p className={`text-[10px] font-medium leading-3 ${appTextSoftClass}`}>{fact.label}</p>
                  <p className={`mt-0.5 text-[0.92rem] font-semibold tracking-[-0.03em] leading-4 ${appTextStrongClass}`}>
                    {fact.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,2fr)_280px]">
            <div className={`${nestedPanelClass} overflow-hidden px-3.5 py-3.5 sm:px-4 sm:py-4`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-[0.96rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                    {taxSummaryLabels.deductibleExpensesTitle}
                  </p>
                  <p className={`mt-0.5 text-[12px] leading-4.5 ${appTextMutedClass}`}>
                    {taxSummaryLabels.deductibleExpensesHelp}
                  </p>
                </div>
                <div className="rounded-[12px] border border-[rgba(31,79,136,0.08)] bg-[rgba(31,79,136,0.04)] px-2.5 py-1 text-right">
                  <p className={`text-[9px] font-medium ${appTextSoftClass}`}>{taxSummaryLabels.totalDeductibleExpenses}</p>
                  <p className={`mt-0.5 text-[0.9rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                    {formatOperatingAmount(taxRuntime.generic.deductibleExpenses)}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 overflow-hidden rounded-[16px] border border-[var(--app-border)] bg-white">
                <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--app-border)] px-3.5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] ${appTextSoftClass}`}>
                  <p>{taxSummaryLabels.deductibleExpensesTitle}</p>
                  <p>{taxSummaryLabels.annualAmount}</p>
                </div>

                {taxRuntime.generic.deductibleExpenseItems.length > 0 ? (
                  taxRuntime.generic.deductibleExpenseItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-2 ${
                        index < taxRuntime.generic.deductibleExpenseItems.length - 1
                          ? 'border-b border-[var(--app-border)]'
                          : ''
                      }`}
                    >
                      <div>
                        {item.groupLabel ? (
                          <p className={`text-[8px] font-semibold uppercase tracking-[0.16em] ${appTextSoftClass}`}>
                            {item.groupLabel}
                          </p>
                        ) : null}
                        <p className={`text-[0.88rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>
                          {item.uiLabel ?? item.label}
                        </p>
                        <p className={`mt-0.5 text-[10px] leading-3.5 ${appTextMutedClass}`}>
                          {item.uiLabel ? item.label : item.description || taxSummaryLabels.noValue}
                        </p>
                        {item.badges?.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.badges.map((badge) => (
                              <span
                                key={badge.id}
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${taxBadgeToneClasses[badge.tone]}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p className={`text-right text-[0.88rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                        {formatOperatingAmount(item.value)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-5">
                    <p className={`text-sm ${appTextMutedClass}`}>{t('propertiesUi.noDeductibleExpenses')}</p>
                  </div>
                )}
              </div>
            </div>

            <div className={`${nestedPanelClass} overflow-hidden border border-[rgba(15,23,42,0.05)] bg-[rgba(255,255,255,0.72)] px-3 py-3.5 sm:px-3.5 sm:py-4`}>
              <div>
                <p className={`text-[0.92rem] font-semibold tracking-[-0.03em] ${appTextStrongClass}`}>
                  {taxSummaryLabels.assumptionsPanel}
                </p>
                <p className={`mt-0.5 text-[11px] leading-4 ${appTextMutedClass}`}>
                  {taxSummaryLabels.assumptionsPanelHelp}
                </p>
              </div>

              <div className="mt-2.5 space-y-1.5">
                {taxAssumptionItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.key} className="flex items-start gap-1.5 rounded-[10px] border border-[rgba(15,23,42,0.05)] bg-white/85 px-2 py-1.5">
                      <div className="rounded-md bg-[rgba(31,79,136,0.05)] p-1.25 text-[var(--app-nav-active-fg)]">
                        <Icon className="h-3 w-3" />
                      </div>
                      <div>
                        <p className={`text-[0.8rem] font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>
                          {item.title}
                        </p>
                        <p className={`mt-0.5 text-[10px] leading-3.5 ${appTextMutedClass}`}>
                          {item.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {taxPracticalNotes.length > 0 ? (
                <div className="mt-2.5 rounded-[14px] border border-amber-200/80 bg-amber-50/65 px-3 py-2.5">
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700`}>
                    {taxSummaryLabels.practicalNotes}
                  </p>
                  <div className="mt-2 space-y-1">
                    {taxPracticalNotes.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3">
                        <span className={`text-[10px] ${appTextMutedClass}`}>{item.label}</span>
                        <span className={`text-[10px] font-semibold ${appTextStrongClass}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {taxRuntime.generic.disclaimers.length > 0 ? (
                <div className="mt-2.5 rounded-[14px] border border-dashed border-[var(--app-border)] bg-[var(--app-panel-inset)] px-3 py-2.5">
                  <p className={`text-[10px] leading-3.5 ${appTextMutedClass}`}>
                    {taxRuntime.generic.disclaimers[0]}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'notes' ? (
        <div className="space-y-5 px-5 py-5">
          <div className={`${nestedPanelClass} ${cardPaddingClass}`}>
            {renderSectionHeader(t('properties.labels.quickNotes'), 'notes')}
            {property.notes ? (
              <div className="mt-3 flex items-start gap-3">
                <div className="rounded-2xl border border-[var(--app-border)] bg-white p-2.5 text-[var(--app-nav-active-fg)]">
                  <StickyNote className="h-4 w-4" />
                </div>
                <p className={`text-[14px] leading-6 ${appTextMutedClass}`}>{property.notes}</p>
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-dashed border-[var(--app-border)] bg-white px-4 py-5">
                <p className={`text-sm font-medium ${appTextStrongClass}`}>
                  {isSpanish ? 'No hay notas para esta propiedad' : 'No notes for this property yet'}
                </p>
                <p className={`mt-1 text-sm leading-6 ${appTextMutedClass}`}>
                  {isSpanish
                    ? 'Mantuvimos esta seccion visible para que puedas anadir contexto aunque todavia no haya contenido.'
                    : 'This section stays visible so you can add context even when nothing has been written yet.'}
                </p>
              </div>
            )}
          </div>

          <div className={`${nestedPanelClass} ${cardPaddingClass}`}>
            {renderSectionHeader(isSpanish ? 'Notas fiscales' : 'Tax notes', 'tax')}
            {property.taxNotes ? (
              <p className={`mt-3 text-[14px] leading-6 ${appTextMutedClass}`}>{property.taxNotes}</p>
            ) : (
              <p className={`mt-3 text-sm ${appTextMutedClass}`}>
                {isSpanish ? 'No hay notas fiscales guardadas.' : 'No tax notes saved.'}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'gallery' ? <div>{renderHeroGallery(true)}</div> : null}

      {isLightboxOpen && safeCurrentGalleryImage ? (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${appOverlayClass}`}>
          <div className="relative w-full max-w-6xl">
            <button type="button" onClick={() => setIsLightboxOpen(false)} className={`absolute right-0 top-0 z-10 rounded-full p-2 transition ${appButtonMutedClass} ${appTextStrongClass}`} aria-label={t('common.closeGallery')}>
              <X className="h-5 w-5" />
            </button>
            <div className={`overflow-hidden rounded-[28px] p-4 ${appPanelClass}`}>
              <div className="relative">
                <img src={safeCurrentGalleryImage} alt={`${property.name} expanded ${selectedImageIndex + 1}`} className="h-[72vh] w-full rounded-[20px] bg-[var(--app-panel-inset)] object-contain object-center" />
                <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-medium ${appPanelClass} ${appTextStrongClass}`}>{selectedImageIndex + 1} / {galleryImages.length}</div>
                {hasMultipleImages ? (
                  <>
                    <button type="button" onClick={goToPreviousImage} className={`absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2 transition ${appButtonMutedClass} ${appTextStrongClass} hover:border-cyan-400/40 hover:text-cyan-700 dark:hover:text-cyan-300`} aria-label={t('common.previousImage')}><ChevronLeft className="h-5 w-5" /></button>
                    <button type="button" onClick={goToNextImage} className={`absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 transition ${appButtonMutedClass} ${appTextStrongClass} hover:border-cyan-400/40 hover:text-cyan-700 dark:hover:text-cyan-300`} aria-label={t('common.nextImage')}><ChevronRight className="h-5 w-5" /></button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
