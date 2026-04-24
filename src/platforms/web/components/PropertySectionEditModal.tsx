import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Upload, X } from 'lucide-react';
import type { Lease, Property, RentUpdateIndexType, RentUpdateRuleType } from '../../../common/types';
import { createDefaultLease, getActiveLease, rentUpdateIndexTypes, rentUpdateRuleTypes } from '../../../common/utils/leaseUpdates';
import { defaultPropertyType, propertyTypeValues } from '../../../common/utils/propertyTypes';
import { CompactEditModal } from './CompactEditModal';
import { useSettings } from '../context/SettingsContext';
import { appBorderClass, appButtonMutedClass, appButtonPrimaryClass, appInputClass, appPanelClass, appTextMutedClass, appTextSoftClass, appTextStrongClass } from '../styles/dashboardTheme';

export type PropertySectionEditorKey = 'documents' | 'gallery' | 'lease-tenancy' | 'property-details' | 'purchase-details';

interface PropertySectionEditModalProps {
  property: Property;
  section: PropertySectionEditorKey;
  onClose: () => void;
  onSave: (property: Property) => void;
}

const sectionLabels: Record<PropertySectionEditorKey, string> = {
  gallery: 'Gallery',
  documents: 'Reference Fields',
  'lease-tenancy': 'Lease & Tenancy',
  'property-details': 'Property Details',
  'purchase-details': 'Purchase Details',
};

export const PropertySectionEditModal: React.FC<PropertySectionEditModalProps> = ({
  property,
  section,
  onClose,
  onSave,
}) => {
  const { t } = useSettings();
  const activeLease = useMemo(() => getActiveLease(property) ?? createDefaultLease(property), [property]);
  const [occupancyStatus, setOccupancyStatus] = useState(property.occupancyStatus);
  const [leaseType, setLeaseType] = useState(property.leaseType ?? '');
  const [leaseEndDate, setLeaseEndDate] = useState(property.leaseEndDate ?? '');
  const [rentRuleType, setRentRuleType] = useState<RentUpdateRuleType>(activeLease.rentUpdateRule.type);
  const [rentRuleFrequency, setRentRuleFrequency] = useState(activeLease.rentUpdateRule.frequency);
  const [rentRuleIndexType, setRentRuleIndexType] = useState<'' | RentUpdateIndexType>(
    (activeLease.rentUpdateRule.indexType ?? '') as '' | RentUpdateIndexType
  );
  const [rentRuleNextUpdateDate, setRentRuleNextUpdateDate] = useState(
    activeLease.rentUpdateRule.nextUpdateDate ?? ''
  );
  const [securityDeposit, setSecurityDeposit] = useState(
    activeLease.securityDeposit ?? property.rentalDeposit ?? 0
  );
  const [propertyType, setPropertyType] = useState(property.propertyType ?? defaultPropertyType);
  const [bedrooms, setBedrooms] = useState(property.bedrooms ?? 0);
  const [bathrooms, setBathrooms] = useState(property.bathrooms ?? 0);
  const [builtAreaSqm, setBuiltAreaSqm] = useState(property.builtAreaSqm ?? 0);
  const [floor, setFloor] = useState(property.floor ?? 0);
  const [yearBuilt, setYearBuilt] = useState(property.yearBuilt ?? 0);
  const [renovatedYear, setRenovatedYear] = useState(property.renovatedYear ?? 0);
  const [furnishedStatus, setFurnishedStatus] = useState(property.furnishedStatus ?? '');
  const [condition, setCondition] = useState(property.condition ?? '');
  const [purchasePrice, setPurchasePrice] = useState(property.purchasePrice ?? 0);
  const [currentEstimatedValue, setCurrentEstimatedValue] = useState(property.currentEstimatedValue ?? 0);
  const [purchaseDate, setPurchaseDate] = useState(property.purchaseDate ?? '');
  const [imageUrl, setImageUrl] = useState(property.imageUrl ?? '');
  const [imageUrls, setImageUrls] = useState(property.imageUrls ?? []);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(property.primaryImageIndex ?? 0);
  const [documentImageUrl, setDocumentImageUrl] = useState(property.imageUrl ?? '');
  const [documentImageUrls, setDocumentImageUrls] = useState((property.imageUrls ?? []).join('\n'));
  const [documentPrimaryImageIndex, setDocumentPrimaryImageIndex] = useState(property.primaryImageIndex ?? 0);
  useEffect(() => {
    const nextActiveLease = getActiveLease(property) ?? createDefaultLease(property);
    setOccupancyStatus(property.occupancyStatus);
    setLeaseType(property.leaseType ?? '');
    setLeaseEndDate(property.leaseEndDate ?? '');
    setRentRuleType(nextActiveLease.rentUpdateRule.type);
    setRentRuleFrequency(nextActiveLease.rentUpdateRule.frequency);
    setRentRuleIndexType((nextActiveLease.rentUpdateRule.indexType ?? '') as '' | RentUpdateIndexType);
    setRentRuleNextUpdateDate(nextActiveLease.rentUpdateRule.nextUpdateDate ?? '');
    setSecurityDeposit(nextActiveLease.securityDeposit ?? property.rentalDeposit ?? 0);
    setPropertyType(property.propertyType ?? defaultPropertyType);
    setBedrooms(property.bedrooms ?? 0);
    setBathrooms(property.bathrooms ?? 0);
    setBuiltAreaSqm(property.builtAreaSqm ?? 0);
    setFloor(property.floor ?? 0);
    setYearBuilt(property.yearBuilt ?? 0);
    setRenovatedYear(property.renovatedYear ?? 0);
    setFurnishedStatus(property.furnishedStatus ?? '');
    setCondition(property.condition ?? '');
    setPurchasePrice(property.purchasePrice ?? 0);
    setCurrentEstimatedValue(property.currentEstimatedValue ?? 0);
    setPurchaseDate(property.purchaseDate ?? '');
    setImageUrl(property.imageUrl ?? '');
    setImageUrls(property.imageUrls ?? []);
    setPrimaryImageIndex(property.primaryImageIndex ?? 0);
    setDocumentImageUrl(property.imageUrl ?? '');
    setDocumentImageUrls((property.imageUrls ?? []).join('\n'));
    setDocumentPrimaryImageIndex(property.primaryImageIndex ?? 0);
  }, [property]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const syncPrimaryImage = (nextImageUrls: string[], nextPrimaryImageIndex: number) => {
    const safePrimaryImageIndex = Math.min(Math.max(nextPrimaryImageIndex, 0), Math.max(nextImageUrls.length - 1, 0));

    setImageUrls(nextImageUrls);
    setPrimaryImageIndex(safePrimaryImageIndex);
    setImageUrl(nextImageUrls[safePrimaryImageIndex] ?? '');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    const uploadedImages = await Promise.all(files.map(readFileAsDataUrl));
    const nextImageUrls = [...imageUrls, ...uploadedImages];
    const nextPrimaryImageIndex = imageUrls.length === 0 ? 0 : primaryImageIndex;

    syncPrimaryImage(nextImageUrls, nextPrimaryImageIndex);
    event.target.value = '';
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const nextImageUrls = imageUrls.filter((_, index) => index !== indexToRemove);
    const nextPrimaryImageIndex =
      nextImageUrls.length === 0
        ? 0
        : indexToRemove < primaryImageIndex
        ? primaryImageIndex - 1
        : Math.min(primaryImageIndex, nextImageUrls.length - 1);

    syncPrimaryImage(nextImageUrls, nextPrimaryImageIndex);
  };

  const handleSetPrimaryImage = (nextPrimaryImageIndex: number) => {
    syncPrimaryImage(imageUrls, nextPrimaryImageIndex);
  };

  const handleMoveImage = (index: number, direction: -1 | 1) => {
    if (index < 0 || index >= imageUrls.length) {
      console.debug('[property-gallery] invalid selected image index', {
        index,
        length: imageUrls.length,
      });
      return;
    }

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= imageUrls.length) {
      return;
    }

    const nextImageUrls = [...imageUrls];
    [nextImageUrls[index], nextImageUrls[targetIndex]] = [nextImageUrls[targetIndex], nextImageUrls[index]];

    const nextPrimaryImageIndex =
      primaryImageIndex === index
        ? targetIndex
        : primaryImageIndex === targetIndex
        ? index
        : primaryImageIndex;

    syncPrimaryImage(nextImageUrls, nextPrimaryImageIndex);
  };

  const purchasePerSqm = purchasePrice && builtAreaSqm > 0 ? purchasePrice / builtAreaSqm : 0;
  const estimatedPerSqm = currentEstimatedValue && builtAreaSqm > 0 ? currentEstimatedValue / builtAreaSqm : 0;

  const handleSave = () => {
    if (section === 'lease-tenancy') {
      const updatedLease: Lease = {
        ...activeLease,
        name: leaseType || 'Current lease',
        endDate: leaseEndDate,
        securityDeposit,
        rentUpdateRule: {
          ...activeLease.rentUpdateRule,
          type: rentRuleType,
          frequency: rentRuleFrequency,
          indexType: rentRuleType === 'official-index' ? (rentRuleIndexType || null) : null,
          nextUpdateDate: rentRuleNextUpdateDate,
        },
      };

      onSave({
        ...property,
        occupancyStatus,
        leaseType,
        leaseEndDate,
        rentalDeposit: securityDeposit,
        rentalDepositCurrency: activeLease.securityDepositCurrency ?? property.rentalDepositCurrency,
        leases: [
          updatedLease,
          ...(property.leases ?? [])
            .filter((lease) => lease.id !== updatedLease.id)
            .map((lease) => ({ ...lease, active: false })),
        ],
        activeLeaseId: updatedLease.id,
      });
      return;
    }

    if (section === 'property-details') {
      onSave({
        ...property,
        propertyType,
        builtAreaSqm,
        bedrooms,
        bathrooms,
        floor,
        yearBuilt,
        renovatedYear,
        furnishedStatus,
        condition,
      });
      return;
    }

    if (section === 'gallery') {
      onSave({
        ...property,
        imageUrl,
        imageUrls,
        primaryImageIndex: Math.min(primaryImageIndex, Math.max(imageUrls.length - 1, 0)),
      });
      return;
    }

    if (section === 'documents') {
    const nextImageUrls = documentImageUrls
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean);
      onSave({
        ...property,
        imageUrl: documentImageUrl,
        imageUrls: nextImageUrls,
        primaryImageIndex: Math.min(documentPrimaryImageIndex, Math.max(nextImageUrls.length - 1, 0)),
      });
      return;
    }

    onSave({
      ...property,
      purchaseDate,
      purchasePrice,
      currentEstimatedValue,
    });
  };

  const leaseRuleHint =
    rentRuleType === 'official-index'
      ? 'Choose an official index and next update date.'
      : 'Keep the update rule focused on this lease only.';

  return (
    <CompactEditModal
      eyebrow="Properties"
      title={sectionLabels[section]}
      subtitle={
        section === 'lease-tenancy'
          ? 'Edit the lease-specific fields only.'
          : section === 'property-details'
          ? 'Edit the property description fields only.'
          : section === 'purchase-details'
          ? 'Edit purchase price and valuation fields only.'
          : section === 'documents'
          ? 'Use the current reference fields that back the documents entry point.'
          : 'Edit gallery media only.'
      }
      onClose={onClose}
      sectionWidthClassName="sm:max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl px-4 py-2 ${appButtonMutedClass} ${appTextMutedClass}`}
          >
            Cancel
          </button>
          <button type="submit" form="property-section-edit-form" className={`rounded-2xl px-4 py-2 ${appButtonPrimaryClass}`}>
            Save
          </button>
        </div>
      }
    >
      <form
        id="property-section-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className="space-y-5 p-4 pb-16 sm:p-6 sm:pb-20"
      >
        {section === 'lease-tenancy' ? (
          <div className={`space-y-4 rounded-2xl border p-4 ${appBorderClass} ${appPanelClass}`}>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Occupancy Status
              </label>
              <select
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={occupancyStatus}
                onChange={(event) =>
                  setOccupancyStatus(event.target.value as Property['occupancyStatus'])
                }
              >
                <option value="occupied">{t('properties.status.occupied')}</option>
                <option value="vacant">{t('properties.status.vacant')}</option>
                <option value="tenant-to-be-confirmed">{t('properties.status.tbc')}</option>
              </select>
            </div>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Lease Type
              </label>
              <input
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={leaseType}
                onChange={(event) => setLeaseType(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Lease End
                </label>
                <input
                  type="date"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={leaseEndDate}
                  onChange={(event) => setLeaseEndDate(event.target.value)}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Next Update
                </label>
                <input
                  type="date"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={rentRuleNextUpdateDate}
                  onChange={(event) => setRentRuleNextUpdateDate(event.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Rent Update Rule
              </label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <select
                  className={`w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={rentRuleType}
                  onChange={(event) => setRentRuleType(event.target.value as RentUpdateRuleType)}
                >
                  {rentUpdateRuleTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className={`w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={rentRuleFrequency}
                  onChange={(event) =>
                    setRentRuleFrequency(event.target.value as Lease['rentUpdateRule']['frequency'])
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="every-3-months">Every 3 months</option>
                  <option value="every-4-months">Every 4 months</option>
                  <option value="every-6-months">Every 6 months</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
                {rentRuleType === 'official-index' ? (
                  <select
                    className="w-full rounded-2xl px-3 py-2 sm:col-span-2"
                    value={rentRuleIndexType}
                    onChange={(event) =>
                      setRentRuleIndexType(event.target.value as '' | RentUpdateIndexType)
                    }
                  >
                    <option value="">{t('common.select')}</option>
                    {rentUpdateIndexTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <p className={`mt-2 text-xs ${appTextSoftClass}`}>{leaseRuleHint}</p>
            </div>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Deposit
              </label>
              <input
                type="number"
                min="0"
                step="10"
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={securityDeposit}
                onChange={(event) => setSecurityDeposit(parseFloat(event.target.value) || 0)}
              />
            </div>
          </div>
        ) : null}

        {section === 'property-details' ? (
          <div className={`space-y-4 rounded-2xl border p-4 ${appBorderClass} ${appPanelClass}`}>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Property Type
              </label>
              <select
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value)}
              >
                {propertyTypeValues.map((option) => (
                  <option key={option} value={option}>
                    {t(`properties.form.propertyTypeOptions.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Beds
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={bedrooms}
                  onChange={(event) => setBedrooms(parseFloat(event.target.value) || 0)}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Baths
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={bathrooms}
                  onChange={(event) => setBathrooms(parseFloat(event.target.value) || 0)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Built Area
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={builtAreaSqm}
                  onChange={(event) => setBuiltAreaSqm(parseFloat(event.target.value) || 0)}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Floor
                </label>
                <input
                  type="number"
                  step="1"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={floor}
                  onChange={(event) => setFloor(parseFloat(event.target.value) || 0)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Year Built
                </label>
                <input
                  type="number"
                  step="1"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={yearBuilt}
                  onChange={(event) => setYearBuilt(parseFloat(event.target.value) || 0)}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Renovated
                </label>
                <input
                  type="number"
                  step="1"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={renovatedYear}
                  onChange={(event) => setRenovatedYear(parseFloat(event.target.value) || 0)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Furnishing
                </label>
                <input
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={furnishedStatus}
                  onChange={(event) => setFurnishedStatus(event.target.value)}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Condition
                </label>
                <input
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                />
              </div>
            </div>
          </div>
        ) : null}

        {section === 'purchase-details' ? (
          <div className={`space-y-4 rounded-2xl border p-4 ${appBorderClass} ${appPanelClass}`}>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Purchase Date
              </label>
              <input
                type="date"
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Purchase Price
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={purchasePrice}
                  onChange={(event) => setPurchasePrice(parseFloat(event.target.value) || 0)}
                />
                <p className={`mt-2 text-xs ${appTextSoftClass}`}>
                  {builtAreaSqm > 0
                    ? `~ ${purchasePerSqm.toFixed(2)} per m2`
                    : 'Add built area in Property Details to calculate per m2.'}
                </p>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Estimated Value
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                  value={currentEstimatedValue}
                  onChange={(event) => setCurrentEstimatedValue(parseFloat(event.target.value) || 0)}
                />
                <p className={`mt-2 text-xs ${appTextSoftClass}`}>
                  {builtAreaSqm > 0
                    ? `~ ${estimatedPerSqm.toFixed(2)} per m2`
                    : 'Add built area in Property Details to calculate per m2.'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {section === 'gallery' ? (
          <div className={`space-y-4 rounded-2xl border p-4 ${appBorderClass} ${appPanelClass}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                  Gallery Images
                </label>
                <p className={`mt-1 text-sm ${appTextMutedClass}`}>
                  Upload images, choose a primary image, and reorder them without leaving this section.
                </p>
              </div>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 ${appButtonMutedClass} ${appTextStrongClass}`}>
                <Upload className="h-4 w-4" />
                <span>Upload</span>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            {imageUrls.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {imageUrls.map((galleryImageUrl, index) => {
                  const isPrimary = index === primaryImageIndex;

                  return (
                    <div
                      key={`${galleryImageUrl}-${index}`}
                      className={`overflow-hidden rounded-2xl border ${isPrimary ? 'border-cyan-500/60 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]' : appBorderClass}`}
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryImage(index)}
                          className="block w-full"
                        >
                          <img
                            src={galleryImageUrl}
                            alt={`Property image ${index + 1}`}
                            className="h-40 w-full bg-[var(--app-panel-inset)] object-cover object-center"
                          />
                        </button>
                        <div className="absolute left-3 top-3 flex items-center gap-2">
                          {isPrimary ? (
                            <span className="rounded-full bg-cyan-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                              Primary
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className={`space-y-2 border-t p-3 ${appBorderClass} ${appPanelClass}`}>
                        <div className={`text-sm font-medium ${appTextMutedClass}`}>
                          Image {index + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryImage(index)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${isPrimary ? appButtonPrimaryClass : appButtonMutedClass}`}
                          >
                            {isPrimary ? 'Primary image' : 'Set primary'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(index, -1)}
                            disabled={index === 0}
                            className={`rounded-xl p-2 ${appButtonMutedClass} disabled:opacity-40`}
                            aria-label={`Move image ${index + 1} up`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(index, 1)}
                            disabled={index === imageUrls.length - 1}
                            className={`rounded-xl p-2 ${appButtonMutedClass} disabled:opacity-40`}
                            aria-label={`Move image ${index + 1} down`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            className={`ml-auto rounded-xl p-2 ${appButtonMutedClass} text-rose-600`}
                            aria-label={`Remove image ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`rounded-2xl border border-dashed p-5 text-center ${appBorderClass} ${appPanelClass}`}>
                <ImagePlus className={`mx-auto h-7 w-7 ${appTextSoftClass}`} />
                <p className={`mt-2 text-sm font-medium ${appTextMutedClass}`}>No gallery images yet</p>
                <p className={`mt-1 text-xs ${appTextSoftClass}`}>Upload one or more images to start the gallery.</p>
              </div>
            )}
          </div>
        ) : null}

        {section === 'documents' ? (
          <div className={`space-y-4 rounded-2xl border p-4 ${appBorderClass} ${appPanelClass}`}>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Primary Reference URL
              </label>
              <input
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={documentImageUrl}
                onChange={(event) => setDocumentImageUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Additional Reference URLs
              </label>
              <textarea
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                rows={8}
                value={documentImageUrls}
                onChange={(event) => setDocumentImageUrls(event.target.value)}
                placeholder="One URL per line"
              />
            </div>
            <div>
              <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>
                Primary Reference Index
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className={`mt-2 w-full rounded-2xl px-3 py-2 ${appInputClass}`}
                value={documentPrimaryImageIndex}
                onChange={(event) => setDocumentPrimaryImageIndex(parseFloat(event.target.value) || 0)}
              />
            </div>
          </div>
        ) : null}
      </form>
    </CompactEditModal>
  );
};
