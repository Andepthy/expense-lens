import type { ReactNode } from 'react';
import { Checkbox, IconButton, Select, SelectOption, Switch, TextField } from 'material/react';
import { iconMarkup, type LucideIcon } from './iconMarkup';

export type FieldVariant = 'filled' | 'outlined';
export type FieldDensity = 'default' | 'compact';
export type TextFieldType =
  | 'text'
  | 'date'
  | 'number'
  | 'search'
  | 'email'
  | 'tel'
  | 'url'
  | 'password';

export interface TextFieldInputProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: TextFieldType;
  placeholder?: string;
  supportingText?: string;
  error?: boolean;
  required?: boolean;
  disabled?: boolean;
  variant?: FieldVariant;
  density?: FieldDensity;
  ariaLabel?: string;
  leadingIcon?: string;
  name?: string;
  className?: string;
}

/** Controlled Material text field. Every keystroke arrives as `detail.value` on the input event. */
export function TextFieldInput({
  label,
  value,
  onValueChange,
  type = 'text',
  placeholder,
  supportingText,
  error = false,
  required = false,
  disabled = false,
  variant = 'outlined',
  density = 'default',
  ariaLabel,
  leadingIcon,
  name,
  className,
}: TextFieldInputProps) {
  return (
    <TextField
      className={joinClass('app-field', className)}
      label={label}
      value={value}
      type={type}
      placeholder={placeholder}
      supportingText={supportingText}
      error={error}
      required={required}
      disabled={disabled}
      variant={variant}
      density={density}
      ariaLabel={ariaLabel ?? label}
      leadingIcon={leadingIcon}
      name={name}
      onInput={(event) => onValueChange(event.detail.value)}
    />
  );
}

export interface SelectChoice {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectChoice[];
  onValueChange: (value: string) => void;
  supportingText?: string;
  error?: boolean;
  required?: boolean;
  disabled?: boolean;
  variant?: FieldVariant;
  density?: FieldDensity;
  ariaLabel?: string;
  className?: string;
}

/** Controlled Material select. Options are declaration children, not a data prop. */
export function SelectField({
  label,
  value,
  options,
  onValueChange,
  supportingText,
  error = false,
  required = false,
  disabled = false,
  variant = 'outlined',
  density = 'default',
  ariaLabel,
  className,
}: SelectFieldProps) {
  return (
    <Select
      className={joinClass('app-field', className)}
      label={label}
      value={value}
      variant={variant}
      density={density}
      supportingText={supportingText}
      error={error}
      required={required}
      disabled={disabled}
      ariaLabel={ariaLabel ?? label}
      onChange={(event) => onValueChange(event.detail.value ?? '')}
    >
      {options.map((option) => (
        <SelectOption key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </SelectOption>
      ))}
    </Select>
  );
}

export interface SwitchInputProps {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  supportingText?: string;
  disabled?: boolean;
  className?: string;
}

export function SwitchInput({
  label,
  checked,
  onCheckedChange,
  supportingText,
  disabled = false,
  className,
}: SwitchInputProps) {
  return (
    <Switch
      className={joinClass('app-switch', className)}
      checked={checked}
      disabled={disabled}
      supportingText={supportingText}
      onChange={(event) => onCheckedChange(event.detail.checked)}
    >
      {label}
    </Switch>
  );
}

export interface CheckboxInputProps {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function CheckboxInput({ label, checked, onCheckedChange, disabled = false, className }: CheckboxInputProps) {
  return (
    <Checkbox
      className={joinClass('app-checkbox', className)}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.detail.checked)}
    >
      {label}
    </Checkbox>
  );
}

export interface IconButtonActionProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
  className?: string;
}

/** Icon-only actions always carry an accessible name. */
export function IconButtonAction({
  label,
  icon,
  onClick,
  disabled = false,
  variant = 'standard',
  className,
}: IconButtonActionProps) {
  return (
    <IconButton
      className={className}
      ariaLabel={label}
      icon={iconMarkup(icon, 20)}
      variant={variant}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

function joinClass(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}
