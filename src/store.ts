import { create } from 'zustand';
import { parse as parseYaml } from 'yaml';
import type {
  Binding,
  KeyboardDef,
  KeymapModel,
  Layout,
  PickerOption,
  SlotKind,
  SourceFile,
} from './types';
import { getParser } from './dts/lang';
import { buildModel } from './dts/extract';
import { bindingLegend } from './dts/binding';
import { applyEdits, formatUnifiedDiff } from './dts/patch';
import * as gh from './github/client';
import corneLayout from './layouts/corne_6col.json';
import sofleLayout from './layouts/sofle.json';
import keycodes from './zmk/keycodes.json';

const LAYOUTS: Record<string, Layout> = {
  corne_6col: corneLayout as Layout,
  sofle: sofleLayout as Layout,
};

const WASM_URL = `${import.meta.env.BASE_URL}tree-sitter-devicetree.wasm`;

const STORAGE_KEY = 'zmk-keymap-editor';

export interface Status {
  kind: 'idle' | 'busy' | 'ok' | 'error';
  message: string;
}

interface Persisted {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  keyboardId: string;
}

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function persist(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable, ignore */
  }
}

export interface EditorState {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  keyboardId: string;

  keyboards: KeyboardDef[];
  model: KeymapModel | null;
  layout: Layout;
  activeLayer: number;
  activeKey: number | null;
  pickerSlot: SlotKind | null;
  status: Status;
  diff: string[];

  setToken: (token: string) => void;
  setOwner: (owner: string) => void;
  setRepo: (repo: string) => void;
  setBranch: (branch: string) => void;
  setKeyboard: (id: string) => void;
  load: () => Promise<void>;
  selectKeyboard: (id: string) => Promise<void>;
  setActiveLayer: (index: number) => void;
  setActiveKey: (index: number | null) => void;
  openPicker: (slot: SlotKind) => void;
  closePicker: () => void;
  setBinding: (layerIndex: number, keyIndex: number, text: string) => void;
  options: () => PickerOption[];
  legends: () => string[];
  save: () => Promise<void>;
}

const persisted = loadPersisted();

export const useEditor = create<EditorState>((set, get) => ({
  token: persisted.token ?? '',
  owner: persisted.owner ?? 'vkhoilq',
  repo: persisted.repo ?? 'zmk-keyboards',
  branch: persisted.branch ?? 'main',
  keyboardId: persisted.keyboardId ?? '',

  keyboards: [],
  model: null,
  layout: [],
  activeLayer: 0,
  activeKey: null,
  pickerSlot: null,
  status: { kind: 'idle', message: 'Enter a repository and press Load.' },
  diff: [],

  setToken: (token) => {
    set({ token });
    persist({ ...snapshot(get()), token });
  },
  setOwner: (owner) => {
    set({ owner });
    persist({ ...snapshot(get()), owner });
  },
  setRepo: (repo) => {
    set({ repo });
    persist({ ...snapshot(get()), repo });
  },
  setBranch: (branch) => {
    set({ branch });
    persist({ ...snapshot(get()), branch });
  },
  setKeyboard: (keyboardId) => {
    set({ keyboardId });
    persist({ ...snapshot(get()), keyboardId });
  },

  load: async () => {
    const { token, owner, repo, branch } = get();
    if (!token || !owner || !repo) {
      set({ status: { kind: 'error', message: 'A token, owner and repo are required.' } });
      return;
    }

    set({ status: { kind: 'busy', message: 'Loading…' } });

    try {
      const ref = { owner, repo, branch };
      const keyboards = await loadKeyboards(ref, token);
      const keyboardId = keyboards.some((k) => k.id === get().keyboardId)
        ? get().keyboardId
        : (keyboards[0]?.id ?? '');

      set({ keyboards, keyboardId });
      persist({ ...snapshot(get()), keyboardId: keyboardId });

      if (!keyboardId) {
        set({
          status: {
            kind: 'error',
            message: 'No keyboard found. Add config/keyboards.yaml to the repository.',
          },
        });
        return;
      }

      await loadKeyboard(get, set, keyboardId);
    } catch (error) {
      set({ status: { kind: 'error', message: errorMessage(error) } });
    }
  },

  selectKeyboard: async (id) => {
    set({ keyboardId: id });
    persist({ ...snapshot(get()), keyboardId: id });
    try {
      await loadKeyboard(get, set, id);
    } catch (error) {
      set({ status: { kind: 'error', message: errorMessage(error) } });
    }
  },

  setActiveLayer: (index) => set({ activeLayer: index, activeKey: null }),
  setActiveKey: (index) => set({ activeKey: index }),
  openPicker: (slot) => set({ pickerSlot: slot }),
  closePicker: () => set({ pickerSlot: null }),

  setBinding: (layerIndex, keyIndex, text) => {
    const state = get();
    const model = state.model;
    if (!model) return;

    const layer = model.layers[layerIndex];
    const binding = layer?.bindings[keyIndex];
    if (!binding) return;

    const file = model.files[binding.file];
    if (!file) return;

    const patched = applyEdits(file.text, [
      { file: binding.file, range: binding.range, text },
    ]);

    const files: Record<string, SourceFile> = {
      ...model.files,
      [binding.file]: { ...file, text: patched, dirty: true },
    };

    void rebuild(get, set, files, layerIndex);
  },

  options: () => buildOptions(get()),

  legends: () => {
    const model = get().model;
    if (!model) return [];
    const layer = model.layers[get().activeLayer];
    if (!layer) return [];
    return layer.bindings.map((binding) => bindingLegend(binding));
  },

  save: async () => {
    const { token, owner, repo, branch, model } = get();
    if (!model) return;

    const changed = Object.values(model.files).filter((file) => file.dirty);
    if (changed.length === 0) {
      set({ status: { kind: 'ok', message: 'Nothing to save.' } });
      return;
    }

    set({ status: { kind: 'busy', message: 'Committing…' } });

    try {
      const sha = await gh.commitFiles(
        { owner, repo, branch },
        token,
        changed.map((file) => ({ path: file.path, text: file.text })),
        'Updated keymap with zmk-keymap-editor',
      );

      for (const file of changed) file.dirty = false;

      set({
        status: { kind: 'ok', message: `Committed ${changed.length} file(s): ${sha.slice(0, 7)}` },
      });
    } catch (error) {
      set({ status: { kind: 'error', message: errorMessage(error) } });
    }
  },
}));

function snapshot(state: EditorState): Persisted {
  return {
    token: state.token,
    owner: state.owner,
    repo: state.repo,
    branch: state.branch,
    keyboardId: state.keyboardId,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Read config/keyboards.yaml from the repository. */
async function loadKeyboards(ref: gh.RepoRef, token: string): Promise<KeyboardDef[]> {
  const entries = await gh.listDirectory(ref, token, 'config');
  const manifest = entries.find((entry) => entry.name === 'keyboards.yaml');

  if (!manifest) return [];

  const file = await gh.getFile(ref, token, manifest.path);
  const parsed = parseYaml(file.text) as Record<string, { keymap?: string; layout?: string }>;

  return Object.entries(parsed).map(([id, value]) => ({
    id,
    label: id,
    keymap: value?.keymap ?? `config/${id}.keymap`,
    layout: value?.layout ?? id,
  }));
}

/** Fetch a keymap and every local include it uses. */
async function fetchKeymapFiles(
  ref: gh.RepoRef,
  token: string,
  keymapPath: string,
): Promise<Record<string, SourceFile>> {
  const files: Record<string, SourceFile> = {};
  const queue = [keymapPath];

  while (queue.length > 0) {
    const path = queue.shift() as string;
    if (files[path]) continue;

    const file = await gh.getFile(ref, token, path);
    files[path] = { path, text: file.text, baseSha: file.sha, dirty: false };

    for (const include of localIncludes(file.text)) {
      const resolved = resolveInclude(path, include);
      if (resolved && !files[resolved]) queue.push(resolved);
    }
  }

  return files;
}

/** The `#include "..."` paths of a file that are not system includes. */
export function localIncludes(text: string): string[] {
  const out: string[] = [];
  const pattern = /^[ \t]*#include[ \t]+"([^"]+)"/gm;
  let match = pattern.exec(text);
  while (match) {
    out.push(match[1]);
    match = pattern.exec(text);
  }
  return out;
}

/** Resolve an include relative to the directory of the including file. */
export function resolveInclude(fromPath: string, include: string): string | null {
  if (include.startsWith('/')) return include.slice(1);
  const parts = fromPath.split('/');
  parts.pop();
  for (const part of include.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

async function loadKeyboard(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  keyboardId: string,
) {
  const { token, owner, repo, branch, keyboards } = get();
  const keyboard = keyboards.find((k) => k.id === keyboardId);
  if (!keyboard) return;

  const ref = { owner, repo, branch };
  const files = await fetchKeymapFiles(ref, token, keyboard.keymap);

  const parser = await getParser(WASM_URL);
  const model = buildModel(parser, files, keyboard.keymap);

  set({
    model,
    layout: LAYOUTS[keyboard.layout] ?? [],
    activeLayer: 0,
    activeKey: null,
    status: {
      kind: model.errors.length > 0 ? 'error' : 'ok',
      message:
        model.errors.length > 0
          ? `${model.errors.length} parse issue(s) in ${keyboard.keymap}`
          : `Loaded ${keyboard.keymap}: ${model.layers.length} layers, ${model.behaviors.length} behaviors`,
    },
  });
}

/** Re-parse the files after an edit and keep the model in sync. */
async function rebuild(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  files: Record<string, SourceFile>,
  activeLayer: number,
) {
  const state = get();
  const model = state.model;
  if (!model) return;

  const parser = await getParser(WASM_URL);
  const rebuilt = buildModel(parser, files, model.layers[0]?.file ?? Object.keys(files)[0]);

  set({ model: rebuilt, activeLayer: Math.min(activeLayer, rebuilt.layers.length - 1) });
}

/** Build the list of choices shown in the picker. */
function buildOptions(state: EditorState): PickerOption[] {
  const options: PickerOption[] = [];

  for (const keycode of keycodes as {
    code: string;
    label: string;
    description: string;
    common: boolean;
  }[]) {
    options.push({
      kind: 'keycode',
      code: keycode.code,
      label: keycode.label,
      detail: keycode.description,
      cells: 1,
      template: keycode.code,
    });
  }

  for (const behavior of state.model?.behaviors ?? []) {
    options.push({
      kind: 'behavior',
      code: behavior.label,
      label: behavior.label.replace(/^_/, ''),
      detail: behavior.compatible,
      cells: behavior.cells,
      template: behavior.label,
    });
  }

  for (const macro of state.model?.macros ?? []) {
    options.push({
      kind: 'macro',
      code: macro.label,
      label: macro.label,
      detail: macro.bindings.join(' '),
      cells: 0,
      template: macro.label,
    });
  }

  options.push({
    kind: 'none',
    code: 'none',
    label: 'None',
    detail: 'disable the key',
    cells: 0,
    template: 'none',
  });

  return options;
}

/** The binding of the currently selected key, used by the picker. */
export function currentBinding(state: EditorState): Binding | undefined {
  const model = state.model;
  if (!model) return undefined;
  const layer = model.layers[state.activeLayer];
  if (!layer || state.activeKey === null) return undefined;
  return layer.bindings[state.activeKey];
}

export { formatUnifiedDiff };
