import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Shield, Receipt, CalendarDays, Info } from 'lucide-react';
import { Property } from '../../../common/types';
import { calculatePropertyTaxRuntime, isSpainProperty } from '../../../common/tax';
import { useSettings } from '../context/SettingsContext';
import {
  appButtonMutedClass,
  appButtonPrimaryClass,
  appInputClass,
  appTextMutedClass,
  appTextSoftClass,
  appTextStrongClass,
} from '../styles/dashboardTheme';
import { CompactEditModal } from './CompactEditModal';

interface TaxAssumptionsEditModalProps {
  property: Property;
  onClose: () => void;
  onSave: (property: Property) => void;
}

type RentalTypeValue = NonNullable<Property['spainRentalType']>;
type OwnerTypeValue = 'individual' | 'company';

const ownerTypeOptions: Array<{ value: OwnerTypeValue; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
];

const rentalTypeOptions: Array<{ value: RentalTypeValue; label: string }> = [
  { value: 'long-term', label: 'Long-term / traditional' },
  { value: 'room-by-room', label: 'Room-by-room' },
  { value: 'seasonal', label: 'Temporary / seasonal' },
  { value: 'tourist', label: 'Tourist / short-term' },
  { value: 'vacant-owner-use', label: 'Vacant / owner use' },
];

const autonomousCommunityOptions = [
  'Andalusia',
  'Aragon',
  'Asturias',
  'Balearic Islands',
  'Basque Country',
  'Canary Islands',
  'Cantabria',
  'Castile and León',
  'Castile-La Mancha',
  'Catalonia',
  'Extremadura',
  'Galicia',
  'La Rioja',
  'Community of Madrid',
  'Region of Murcia',
  'Navarre',
  'Valencian Community',
];

const monthsOptions = Array.from({ length: 13 }, (_, index) => index).map((months) => ({
  value: months,
  label:
    months === 12
      ? '12 months (rented all year)'
      : months === 0
      ? '0 months (not rented)'
      : `${months} month${months === 1 ? '' : 's'}`,
}));

const rentalGuidance: Record<RentalTypeValue, { title: string; body: string; support: string } | null> = {
  'long-term': {
    title: 'Potential reduction',
    body: 'Habitual residence tenant reduction may apply.',
    support: 'Long-term rentals of a habitual residence can qualify for a 60% reduction. Conditions apply.',
  },
  'room-by-room': null,
  seasonal: null,
  tourist: null,
  'vacant-owner-use': null,
};

export const TaxAssumptionsEditModal: React.FC<TaxAssumptionsEditModalProps> = ({
  property,
  onClose,
  onSave,
}) => {
  const { settings } = useSettings();
  const taxRuntime = useMemo(() => calculatePropertyTaxRuntime(property, 0), [property]);
  const [spainOwnerType, setSpainOwnerType] = useState<OwnerTypeValue>(property.spainOwnerType ?? 'individual');
  const [spainRentalType, setSpainRentalType] = useState<RentalTypeValue>(
    (property.spainRentalType as RentalTypeValue) ?? 'long-term'
  );
  const [spainOwnershipPercentage, setSpainOwnershipPercentage] = useState(
    property.spainOwnershipPercentage ?? 100
  );
  const [spainAutonomousCommunity, setSpainAutonomousCommunity] = useState(
    property.spainAutonomousCommunity ?? 'Andalusia'
  );
  const [spainEstimatedMarginalTaxRate, setSpainEstimatedMarginalTaxRate] = useState(
    property.spainEstimatedMarginalTaxRate ?? property.marginalTaxRate ?? 24
  );
  const [spainMonthsRentedInTaxYear, setSpainMonthsRentedInTaxYear] = useState(
    property.spainMonthsRentedInTaxYear ?? 12
  );

  useEffect(() => {
    setSpainOwnerType(property.spainOwnerType ?? 'individual');
    setSpainRentalType((property.spainRentalType as RentalTypeValue) ?? 'long-term');
    setSpainOwnershipPercentage(property.spainOwnershipPercentage ?? 100);
    setSpainAutonomousCommunity(property.spainAutonomousCommunity ?? 'Andalusia');
    setSpainEstimatedMarginalTaxRate(property.spainEstimatedMarginalTaxRate ?? property.marginalTaxRate ?? 24);
    setSpainMonthsRentedInTaxYear(property.spainMonthsRentedInTaxYear ?? 12);
  }, [property]);

  const taxYear = taxRuntime.generic.taxYear;
  const countryModuleLabel = taxRuntime.profile.label;
  const rentalGuidanceCard = rentalGuidance[spainRentalType];
  const taxResidencyLabel = settings.taxProfile.taxResidencyCountry?.trim() || 'Not specified';

  const handleSave = () => {
    onSave({
      ...property,
      spainOwnerType,
      spainRentalType,
      spainOwnershipPercentage,
      spainAutonomousCommunity,
      spainEstimatedMarginalTaxRate,
      spainMonthsRentedInTaxYear,
    });
  };

  return (
    <CompactEditModal
      title="Tax assumptions"
      subtitle="Set the assumptions used to estimate Spain taxes."
      eyebrow="Tax"
      onClose={onClose}
      sectionWidthClassName="sm:max-w-3xl"
      fullWidthClassName="sm:max-w-3xl"
      children={
        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
          <div className="rounded-[22px] border border-[rgba(31,79,136,0.08)] bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.28)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                <CalendarDays className="h-3.5 w-3.5" />
                Tax year: {taxYear}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Spain - IRPF
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {countryModuleLabel}
              </span>
            </div>
            <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Only assumptions that affect the calculation are editable.</p>
                  <p className="text-xs text-cyan-800">Tax year is shown for context.</p>
                </div>
              </div>
            </div>
          </div>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
            <div className="space-y-4">
              <div className="rounded-[22px] border border-[rgba(31,79,136,0.08)] bg-white/80 p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.28)]">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg border border-[rgba(31,79,136,0.1)] bg-[linear-gradient(135deg,rgba(31,79,136,0.12),rgba(59,130,246,0.08))] p-2 text-[var(--app-nav-active-fg)]">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>Filing assumptions</h3>
                    <p className={`text-xs ${appTextMutedClass}`}>These values shape the estimated tax view.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`mb-1.5 block text-xs font-medium ${appTextSoftClass}`}>Owner type</label>
                    <select
                      className={appInputClass}
                      value={spainOwnerType}
                      onChange={(event) => setSpainOwnerType(event.target.value as OwnerTypeValue)}
                    >
                      {ownerTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-medium ${appTextSoftClass}`}>Rental type</label>
                    <select
                      className={appInputClass}
                      value={spainRentalType}
                      onChange={(event) => setSpainRentalType(event.target.value as RentalTypeValue)}
                    >
                      {rentalTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-medium ${appTextSoftClass}`}>Ownership percentage</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className={appInputClass}
                      value={spainOwnershipPercentage}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSpainOwnershipPercentage(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);
                      }}
                    />
                  </div>

                  <div>
                    <label className={`mb-1.5 block text-xs font-medium ${appTextSoftClass}`}>Estimated marginal tax rate</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className={appInputClass}
                      value={spainEstimatedMarginalTaxRate}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSpainEstimatedMarginalTaxRate(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);
                      }}
                    />
                  </div>
                </div>

                <p className={`mt-3 text-xs leading-5 ${appTextMutedClass}`}>
                  This rate is applied to your net rental income after deductions and any applicable reductions.
                </p>
              </div>

              <div className="rounded-[22px] border border-[rgba(31,79,136,0.08)] bg-white/80 p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.28)]">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg border border-[rgba(31,79,136,0.1)] bg-[linear-gradient(135deg,rgba(31,79,136,0.12),rgba(59,130,246,0.08))] p-2 text-[var(--app-nav-active-fg)]">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>Regional tax context</h3>
                    <p className={`text-xs ${appTextMutedClass}`}>Used for Spain-specific rules where applicable.</p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className={`mb-1.5 block text-xs font-medium ${appTextSoftClass}`}>Tax region</label>
                  <select
                    className={appInputClass}
                    value={spainAutonomousCommunity}
                    onChange={(event) => setSpainAutonomousCommunity(event.target.value)}
                  >
                    {autonomousCommunityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className={`mt-2 text-xs ${appTextMutedClass}`}>Used for Spain-specific rules where applicable.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] border border-[rgba(31,79,136,0.08)] bg-white/80 p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.28)]">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg border border-[rgba(31,79,136,0.1)] bg-[linear-gradient(135deg,rgba(31,79,136,0.12),rgba(59,130,246,0.08))] p-2 text-[var(--app-nav-active-fg)]">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>Occupancy assumption</h3>
                    <p className={`text-xs ${appTextMutedClass}`}>Used together with the rental type to evaluate reductions.</p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className={`mb-1.5 block text-xs font-medium ${appTextSoftClass}`}>Months rented in the tax year</label>
                  <select
                    className={appInputClass}
                    value={spainMonthsRentedInTaxYear}
                    onChange={(event) => setSpainMonthsRentedInTaxYear(Number(event.target.value))}
                  >
                    {monthsOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className={`mt-2 text-xs ${appTextMutedClass}`}>Used together with the rental type to evaluate reductions.</p>
                </div>

                {rentalGuidanceCard ? (
                  <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                      {rentalGuidanceCard.title}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-sky-950">{rentalGuidanceCard.body}</p>
                    <p className="mt-1 text-xs leading-5 text-sky-800">{rentalGuidanceCard.support}</p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-sm font-semibold text-slate-800">Potential reduction</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Guidance depends on the selected rental type. This area is reserved for future contextual notes.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-[22px] border border-[rgba(31,79,136,0.08)] bg-white/80 p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.28)]">
                <p className={`text-sm font-semibold tracking-[-0.02em] ${appTextStrongClass}`}>Good to know</p>
                <div className={`mt-2 space-y-2 text-sm leading-6 ${appTextMutedClass}`}>
                  <p>This editor doesn’t include personal deductions, dependents, or wealth tax.</p>
                  <p>Add those in your full tax return if needed.</p>
                </div>
              </div>

              <div className="rounded-[22px] border border-[rgba(31,79,136,0.08)] bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.28)]">
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${appTextSoftClass}`}>Context</p>
                <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                  Tax residency is shown for context only and remains managed in shared settings.
                </p>
                <p className={`mt-2 text-sm leading-6 ${appTextMutedClass}`}>
                  Current residency: <span className={`font-semibold ${appTextStrongClass}`}>{taxResidencyLabel}</span>
                </p>
                <p className={`mt-2 text-xs leading-5 ${appTextMutedClass}`}>
                  {isSpainProperty(property)
                    ? 'Spain tax module active for this property.'
                    : 'Tax module context is based on the property country.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      }
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold ${appButtonMutedClass} ${appTextStrongClass}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold ${appButtonPrimaryClass}`}
          >
            Save assumptions
          </button>
        </div>
      }
    />
  );
};
