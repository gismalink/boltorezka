import type { CSSProperties, InputHTMLAttributes } from "react";

type RangeSliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
};

function clampPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }
  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

export function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  className,
  style,
  valueSuffix,
  formatValue,
  ...rest
}: RangeSliderProps) {
  const minNumber = Number(min);
  const maxNumber = Number(max);
  const safeValue = Number(value);
  const percent = clampPercent(safeValue, minNumber, maxNumber);
  const thumbValue = formatValue
    ? formatValue(safeValue)
    : `${Math.round(safeValue)}${valueSuffix || ""}`;

  return (
    <div
      className="range-slider-wrap"
      style={{
        ["--range-progress" as string]: `${percent}%`,
        ["--range-progress-ratio" as string]: `${percent / 100}`
      }}
    >
      <div className="range-slider-inner">
        <input
          {...rest}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          className={`range-slider-input ${className || ""}`.trim()}
          style={style as CSSProperties}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span
          className="range-slider-thumb-value"
          aria-hidden="true"
        >
          {thumbValue}
        </span>
      </div>
    </div>
  );
}
