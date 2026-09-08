import { useId, type ReactNode } from "react";
import { cx } from "./primitives";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  content: ReactNode;
}
export function Tabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: TabOption<T>[];
}) {
  const id = useId();
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tab-list">
        {options.map((option, index) => (
          <button
            type="button"
            role="tab"
            key={option.value}
            id={`${id}-${option.value}`}
            aria-selected={value === option.value}
            aria-controls={`${id}-panel-${option.value}`}
            tabIndex={value === option.value ? 0 : -1}
            className={cx("tab", value === option.value && "tab--active")}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const nextIndex =
                event.key === "ArrowRight"
                  ? (index + 1) % options.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + options.length) % options.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? options.length - 1
                        : -1;
              const next = options[nextIndex];
              if (next) {
                event.preventDefault();
                onChange(next.value);
                document.getElementById(`${id}-${next.value}`)?.focus();
              }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {options.map((option) => (
        <div
          role="tabpanel"
          tabIndex={0}
          key={option.value}
          id={`${id}-panel-${option.value}`}
          aria-labelledby={`${id}-${option.value}`}
          hidden={value !== option.value}
          className="tab-panel"
        >
          {option.content}
        </div>
      ))}
    </div>
  );
}
