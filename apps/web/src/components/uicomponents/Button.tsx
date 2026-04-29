/**
 * Button.tsx — базовая стилизованная кнопка дизайн-системы.
 * Оборачивает <button> с pixel-стилями; props полностью совместимы с ButtonHTMLAttributes.
 */
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  disabledReason?: string;
};

export function Button({
  className = "",
  disabled = false,
  disabledReason,
  children,
  ...rest
}: ButtonProps) {
  const tooltipText = disabled && disabledReason ? disabledReason : "";
  const buttonNode = (
    <button
      {...rest}
      disabled={disabled}
      className={`ui-btn ${className}`.trim()}
    >
      {children}
    </button>
  );

  if (!tooltipText) {
    return buttonNode;
  }

  return (
    <span className={`ui-btn-disabled-anchor ${className}`.trim()} data-tooltip={tooltipText}>
      {buttonNode}
    </span>
  );
}
