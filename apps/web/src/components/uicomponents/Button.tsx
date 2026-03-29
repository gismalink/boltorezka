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
    <span className="ui-btn-disabled-anchor inline-flex" data-tooltip={tooltipText}>
      {buttonNode}
    </span>
  );
}
