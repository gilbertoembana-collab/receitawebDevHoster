import React, { useState, useEffect, useRef } from 'react';
import { TextField, TextFieldProps, InputAdornment } from '@mui/material';

export interface FormattedCurrencyInputProps extends Omit<TextFieldProps, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
  currencySymbol?: string;
  allowDecimals?: boolean;
  min?: number;
  max?: number;
  onValidate?: () => void;
}

/**
 * Formats a raw numeric value into a localized string with thousand separators (e.g. 10000 -> "10.000")
 */
export const formatNumberWithSeparators = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'number' ? val : Number(String(val).replace(/\D/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-PT');
};

/**
 * Formatted Currency/Money text input component for React with thousands separators.
 * Guarantees smooth typing without unexpected resets or cursor issues while the user writes.
 */
export const FormattedCurrencyInput: React.FC<FormattedCurrencyInputProps> = ({
  value,
  onChange,
  currencySymbol,
  allowDecimals = false,
  min = 0,
  max,
  label,
  helperText,
  onValidate,
  onBlur,
  onFocus,
  onKeyDown,
  ...props
}) => {
  const isFocusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [displayValue, setDisplayValue] = useState<string>(() => {
    return value !== undefined && value !== null && !isNaN(value) && value !== 0
      ? formatNumberWithSeparators(value)
      : value === 0 ? '0' : '';
  });

  // Only synchronize internal display when prop value changes and the user is NOT actively typing inside
  useEffect(() => {
    if (!isFocusedRef.current) {
      const formatted = value !== undefined && value !== null && !isNaN(value)
        ? formatNumberWithSeparators(value)
        : '';
      setDisplayValue(formatted);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;

    // Extract only digits
    const digitsOnly = rawInput.replace(/\D/g, '');

    if (digitsOnly === '') {
      setDisplayValue('');
      onChange(0);
      return;
    }

    let numericVal = parseInt(digitsOnly, 10);
    if (isNaN(numericVal)) {
      numericVal = 0;
    }

    if (min !== undefined && numericVal < min) {
      numericVal = min;
    }
    if (max !== undefined && numericVal > max) {
      numericVal = max;
    }

    // Format with thousands separator
    const formatted = numericVal.toLocaleString('pt-PT');
    setDisplayValue(formatted);
    onChange(numericVal);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    // Format on blur
    if (displayValue !== '') {
      const digitsOnly = displayValue.replace(/\D/g, '');
      const numericVal = digitsOnly ? parseInt(digitsOnly, 10) : 0;
      setDisplayValue(numericVal.toLocaleString('pt-PT'));
      onChange(numericVal);
    }
    if (onBlur) onBlur(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (onValidate) {
        e.preventDefault();
        onValidate();
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  return (
    <TextField
      {...props}
      label={label}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      inputRef={inputRef}
      slotProps={{
        input: {
          endAdornment: currencySymbol ? (
            <InputAdornment position="end">
              <span className="text-xs font-bold text-slate-500 font-sans">{currencySymbol}</span>
            </InputAdornment>
          ) : undefined,
        },
        htmlInput: {
          inputMode: 'numeric',
          autoComplete: 'off',
          placeholder: '0',
          style: { fontFamily: 'monospace', fontWeight: 600 }
        }
      }}
      helperText={helperText}
    />
  );
};

export default FormattedCurrencyInput;
