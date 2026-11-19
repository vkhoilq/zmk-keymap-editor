import { useMemo } from 'react';
import { useEditor } from './store';
import { composeBinding, describeBinding } from './edit';
import type { PickerOption, SlotKind } from './types';
import { Toolbar } from './ui/Toolbar';
import { LayerTabs } from './ui/LayerTabs';
import { Keyboard } from './ui/Keyboard';
import { Picker } from './ui/Picker';
import { Sidebar } from './ui/Sidebar';

export default function App() {
  const state = useEditor();
  const {
    token,
    owner,
    repo,
    branch,
    keyboards,
    keyboardId,
    model,
    layout,
    activeLayer,
    activeKey,
    pickerSlot,
    status,
    setToken,
    setOwner,
    setRepo,
    setBranch,
    load,
    selectKeyboard,
    setActiveLayer,
    setActiveKey,
    openPicker,
    closePicker,
    setBinding,
    save,
  } = state;

  const layers = useMemo(
    () =>
      (model?.layers ?? []).map((layer) => ({
        id: layer.id,
        label: layer.label ?? layer.id,
      })),
    [model],
  );

  const legends = useMemo(() => state.legends(), [model, activeLayer]);
  const options = useMemo(() => state.options(), [model]);

  const dirty = Object.values(model?.files ?? {}).some((file) => file.dirty);
  const canSave = Boolean(model) && dirty && status.kind !== 'busy';

  const currentBinding =
    model && activeKey !== null ? model.layers[activeLayer]?.bindings[activeKey] : undefined;

  const handlePick = (option: PickerOption, params: string[]) => {
    const slot: SlotKind = pickerSlot ?? 'tap';
    const text = composeBinding(currentBinding, slot, option, params);
    if (activeKey !== null) setBinding(activeLayer, activeKey, text);
    closePicker();
  };

  return (
    <div className="app">
      <Toolbar
        owner={owner}
        repo={repo}
        branch={branch}
        token={token}
        keyboards={keyboards.map((k) => ({ id: k.id, label: k.label }))}
        keyboardId={keyboardId}
        status={status}
        dirty={dirty}
        canSave={canSave}
        onOwnerChange={setOwner}
        onRepoChange={setRepo}
        onBranchChange={setBranch}
        onTokenChange={setToken}
        onKeyboardChange={(id) => void selectKeyboard(id)}
        onLoad={() => void load()}
        onSave={() => void save()}
      />

      <LayerTabs
        layers={layers}
        activeIndex={activeLayer}
        onSelect={setActiveLayer}
      />

      <main className="app-body">
        <Keyboard
          layout={layout}
          legends={legends}
          activeKey={activeKey}
          onSelectKey={(index) => {
            setActiveKey(index);
            if (index !== null) openPicker('tap');
          }}
        />

        <Sidebar
          behaviors={model?.behaviors ?? []}
          macros={model?.macros ?? []}
          combos={model?.combos ?? []}
          defines={model?.defines ?? {}}
          activeBehaviorLabel={currentBinding?.behavior ?? null}
          onSelectBehavior={() => undefined}
        />
      </main>

      <Picker
        open={pickerSlot !== null}
        slot={pickerSlot}
        currentLabel={describeBinding(currentBinding)}
        options={options}
        onPick={handlePick}
        onClose={closePicker}
      />
    </div>
  );
}
