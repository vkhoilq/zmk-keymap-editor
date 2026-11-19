import type { BehaviorDef, MacroDef, ComboDef } from "../types";

export interface SidebarProps {
  behaviors: BehaviorDef[];
  macros: MacroDef[];
  combos: ComboDef[];
  defines: Record<string, string>;
  activeBehaviorLabel: string | null;
  onSelectBehavior: (label: string) => void;
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const {
    behaviors,
    macros,
    combos,
    defines,
    activeBehaviorLabel,
    onSelectBehavior,
  } = props;

  const defineEntries = Object.entries(defines);

  return (
    <aside className="sidebar" aria-label="Keymap outline">
      <details className="sidebar-section" open>
        <summary className="sidebar-summary">Behaviors</summary>
        <div className="sidebar-content">
          {behaviors.map((behavior) => {
            const isActive = activeBehaviorLabel === behavior.label;

            return (
              <div
                key={behavior.label}
                className={`sidebar-item${isActive ? " active" : ""}`}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                onClick={() => onSelectBehavior(behavior.label)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectBehavior(behavior.label);
                  }
                }}
              >
                <span className="sidebar-item-name">{behavior.label}</span>
                <span className="sidebar-item-meta">
                  {behavior.cells}
                  {behavior.source === "keymap" && (
                    <span className="sidebar-badge" style={{ marginLeft: 6 }}>
                      keymap
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          {behaviors.length === 0 && (
            <div className="sidebar-empty">No behaviors</div>
          )}
        </div>
      </details>

      <details className="sidebar-section" open>
        <summary className="sidebar-summary">Macros</summary>
        <div className="sidebar-content">
          {macros.map((macro) => (
            <div key={macro.label} className="sidebar-item">
              <span className="sidebar-item-name">{macro.label}</span>
              <span className="sidebar-item-meta" title={macro.bindings.join(" ")}>
                {macro.bindings.join(" ")}
              </span>
            </div>
          ))}
          {macros.length === 0 && (
            <div className="sidebar-empty">No macros</div>
          )}
        </div>
      </details>

      <details className="sidebar-section" open>
        <summary className="sidebar-summary">Combos</summary>
        <div className="sidebar-content">
          {combos.map((combo) => (
            <div key={combo.label} className="sidebar-item">
              <span className="sidebar-item-name">{combo.label}</span>
              <span className="sidebar-item-meta">
                {combo.positions.join(" ")}
              </span>
            </div>
          ))}
          {combos.length === 0 && (
            <div className="sidebar-empty">No combos</div>
          )}
        </div>
      </details>

      <details className="sidebar-section" open>
        <summary className="sidebar-summary">Defines</summary>
        <div className="sidebar-content">
          {defineEntries.map(([name, value]) => (
            <div key={name} className="sidebar-define">
              <span className="sidebar-define-name">{name}</span>
              <span className="sidebar-define-value">= {value}</span>
            </div>
          ))}
          {defineEntries.length === 0 && (
            <div className="sidebar-empty">No defines</div>
          )}
        </div>
      </details>
    </aside>
  );
}
