import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { PickerOption } from "../types";

export interface PickerProps {
  open: boolean;
  slot: "tap" | "hold" | "shifted" | null;
  currentLabel: string | null;
  options: PickerOption[];
  onPick: (option: PickerOption, params: string[]) => void;
  onClose: () => void;
}

export function Picker(props: PickerProps): JSX.Element | null {
  const { open, slot, currentLabel, options, onPick, onClose } = props;

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickerOption | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
      setParams([]);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handler);
    }

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;

    return options.filter((opt) => {
      return (
        opt.code.toLowerCase().includes(q) ||
        opt.label.toLowerCase().includes(q) ||
        (opt.detail?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [options, query]);

  const slotLabel = useMemo(() => {
    if (!slot) return "binding";
    return slot;
  }, [slot]);

  const handleSelect = (option: PickerOption) => {
    if (option.cells === 0) {
      onPick(option, []);
      onClose();
      return;
    }

    const defaults: string[] = [];
    for (let i = 0; i < option.cells; i++) {
      defaults.push(i === 0 ? (option.template ?? "") : "");
    }

    setSelected(option);
    setParams(defaults);
  };

  const handleParamChange = (index: number, value: string) => {
    setParams((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleConfirm = () => {
    if (!selected) return;
    onPick(selected, params);
    onClose();
  };

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="picker-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Pick a ${slotLabel}`}
    >
      <div className="picker">
        <div className="picker-header">
          <h2 className="picker-title">Edit {slotLabel}</h2>
          <div className="picker-current">
            Current: {currentLabel ?? "—"}
          </div>
        </div>

        <div className="picker-search">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keycodes, behaviors, macros…"
            aria-label="Search bindings"
          />
        </div>

        {!selected ? (
          <ul ref={listRef} className="picker-list" role="listbox">
            {filtered.length === 0 ? (
              <li className="picker-empty">No matches</li>
            ) : (
              filtered.map((option) => (
                <li
                  key={`${option.kind}-${option.code}`}
                  className="picker-row"
                  role="option"
                  tabIndex={0}
                  aria-selected={false}
                  onClick={() => handleSelect(option)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect(option);
                    }
                  }}
                >
                  <div className="picker-row-label">
                    <strong>{option.label}</strong>
                    {option.detail && (
                      <span className="picker-row-detail">{option.detail}</span>
                    )}
                  </div>
                  <span className={`picker-badge ${option.kind}`}>{option.kind}</span>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="picker-params">
            <h3 className="picker-params-title">
              {selected.label} ({selected.code}) — {selected.cells} parameter
              {selected.cells === 1 ? "" : "s"}
            </h3>
            <div className="picker-param-fields">
              {params.map((value, index) => (
                <input
                  key={index}
                  type="text"
                  value={value}
                  onChange={(e) => handleParamChange(index, e.target.value)}
                  placeholder={`Param ${index + 1}`}
                  autoFocus={index === 0}
                />
              ))}
            </div>
            <div className="picker-params-actions">
              <button type="button" onClick={() => setSelected(null)}>
                Back
              </button>
              <button type="button" className="primary" onClick={handleConfirm}>
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
