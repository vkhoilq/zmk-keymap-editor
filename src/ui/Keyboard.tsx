import type { LayoutKey } from "../types";

export interface KeyboardProps {
  layout: LayoutKey[];
  legends: string[];
  activeKey: number | null;
  onSelectKey: (index: number | null) => void;
  unit?: number;
}

export function Keyboard(props: KeyboardProps): JSX.Element {
  const { layout, legends, activeKey, onSelectKey, unit = 54 } = props;

  if (layout.length === 0) {
    return (
      <div className="keyboard">
        <div className="keyboard-frame" style={{ padding: 20 }}>
          No layout loaded.
        </div>
      </div>
    );
  }

  const rightEdges = layout.map((k) => {
    const x = k.x ?? 0;
    const w = k.width ?? 1;
    const x2 = k.x2 ?? 0;
    const w2 = k.width2 ?? 1;
    return Math.max(x + w, x + x2 + w2);
  });
  const bottomEdges = layout.map((k) => {
    const y = k.y ?? 0;
    const h = k.height ?? 1;
    const y2 = k.y2 ?? 0;
    const h2 = k.height2 ?? 1;
    return Math.max(y + h, y + y2 + h2);
  });
  const width = Math.max(...rightEdges) * unit;
  const height = Math.max(...bottomEdges) * unit;

  return (
    <div className="keyboard">
      <div
        className="keyboard-frame"
        style={{ width, height }}
        role="group"
        aria-label="Keyboard layout"
      >
        {layout.map((key, index) => {
          const legend = legends[index] ?? "";
          const isActive = activeKey === index;

          return (
            <Key
              key={index}
              index={index}
              keyData={key}
              legend={legend}
              isActive={isActive}
              unit={unit}
              onSelect={onSelectKey}
            />
          );
        })}
      </div>
    </div>
  );
}

interface KeyProps {
  index: number;
  keyData: LayoutKey;
  legend: string;
  isActive: boolean;
  unit: number;
  onSelect: (index: number | null) => void;
}

function Key(props: KeyProps): JSX.Element {
  const { index, keyData, legend, isActive, unit, onSelect } = props;

  const x = keyData.x ?? 0;
  const y = keyData.y ?? 0;
  const width = keyData.width ?? 1;
  const height = keyData.height ?? 1;

  const hasExtension =
    keyData.x2 !== undefined ||
    keyData.y2 !== undefined ||
    keyData.width2 !== undefined ||
    keyData.height2 !== undefined;

  const x2 = keyData.x2 ?? 0;
  const y2 = keyData.y2 ?? 0;
  const width2 = keyData.width2 ?? 1;
  const height2 = keyData.height2 ?? 1;

  const minX = Math.min(x, x + x2);
  const minY = Math.min(y, y + y2);
  const maxX = Math.max(x + width, x + x2 + width2);
  const maxY = Math.max(y + height, y + y2 + height2);

  const wrapperLeft = minX * unit;
  const wrapperTop = minY * unit;
  const wrapperWidth = (maxX - minX) * unit;
  const wrapperHeight = (maxY - minY) * unit;

  const handleClick = () => {
    onSelect(isActive ? null : index);
  };

  return (
    <div
      className={`key${isActive ? " active" : ""}`}
      style={{
        left: wrapperLeft,
        top: wrapperTop,
        width: wrapperWidth,
        height: wrapperHeight,
      }}
      onClick={handleClick}
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
      aria-label={legend || `Key ${index + 1}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div
        className="key-face"
        style={{
          left: (x - minX) * unit,
          top: (y - minY) * unit,
          width: width * unit,
          height: height * unit,
        }}
      />
      {hasExtension && (
        <div
          className="key-ext"
          style={{
            left: (x + x2 - minX) * unit,
            top: (y + y2 - minY) * unit,
            width: width2 * unit,
            height: height2 * unit,
          }}
        />
      )}
      <div
        className="key-legend"
        style={{
          left: (x - minX) * unit + 4,
          top: (y - minY) * unit + (height * unit) / 2,
          width: width * unit - 8,
        }}
      >
        {legend}
      </div>
    </div>
  );
}
