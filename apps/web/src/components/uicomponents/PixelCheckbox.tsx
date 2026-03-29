import type { ReactNode } from "react";

type PixelCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function PixelCheckbox({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className = ""
}: PixelCheckboxProps) {
  const classNames = `pixel-checkbox ${className}`.trim();

  return (
    <label className={classNames}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="pixel-checkbox-native"
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <span aria-hidden="true" className="pixel-checkbox-box" />
      <span className="pixel-checkbox-label">{label}</span>
    </label>
  );
}
