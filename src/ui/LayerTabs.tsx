export interface LayerTabsProps {
  layers: { id: string; label: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function LayerTabs(props: LayerTabsProps): JSX.Element {
  const { layers, activeIndex, onSelect } = props;

  return (
    <div className="layer-tabs" role="tablist" aria-label="Keymap layers">
      {layers.map((layer, index) => {
        const label = layer.label || layer.id;
        const isActive = index === activeIndex;

        return (
          <button
            key={layer.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`layer-tab${isActive ? " active" : ""}`}
            onClick={() => onSelect(index)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
