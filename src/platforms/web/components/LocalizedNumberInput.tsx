import React, { useEffect, useMemo, useState } from 'react';
import { formatLocaleNumberInput, parseLocaleNumberInput } from '../../../common/utils/formatting';
import { useSettings } from '../context/SettingsContext';

type LocalizedNumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export const LocalizedNumberInput: React.FC<LocalizedNumberInputProps> = ({
  value,
  onValueChange,
  minimumFractionDigits,
  maximumFractionDigits,
  onFocus,
  onBlur,
  ...props
}) => {
  const { settings } = useSettings();
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatLocaleNumberInput(value, { minimumFractionDigits, maximumFractionDigits }));

  useEffect(() => {
    if (!isFocused) {
      setDraft(formatLocaleNumberInput(value, { minimumFractionDigits, maximumFractionDigits }));
    }
  }, [maximumFractionDigits, minimumFractionDigits, isFocused, value, settings.language, settings.numberFormat]);

  const displayValue = useMemo(
    () => (isFocused ? draft : formatLocaleNumberInput(value, { minimumFractionDigits, maximumFractionDigits })),
    [draft, isFocused, maximumFractionDigits, minimumFractionDigits, value]
  );

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true);
        setDraft(formatLocaleNumberInput(value, { minimumFractionDigits, maximumFractionDigits }));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        const parsed = parseLocaleNumberInput(event.target.value);
        setDraft(formatLocaleNumberInput(parsed, { minimumFractionDigits, maximumFractionDigits }));
        onValueChange(parsed);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        onValueChange(parseLocaleNumberInput(nextValue));
      }}
    />
  );
};
