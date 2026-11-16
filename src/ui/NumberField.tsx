/** A number field that edits on change, not on every keystroke. */
export function NumberField({ id, value, min, max, step, onCommit, label, disabled, width }: { id: string; value: number; min?: number; max?: number; step?: number; onCommit: (v: number) => void; label?: string; disabled?: boolean; width?: number }) {
  return (
    <input
      key={value}
      id={id}
      className="field num"
      type="number"
      defaultValue={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      style={width ? { width } : undefined}
      onBlur={(e) => Number(e.target.value) !== value && e.target.value !== "" && onCommit(Number(e.target.value))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
