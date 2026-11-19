/**
 * Shared model types for the ZMK keymap editor.
 *
 * The editor parses real `.keymap` devicetree files (with local `#include`
 * support) and edits them in place: every model object that points at source
 * text carries the byte range it came from, so a change can be written back
 * as a surgical patch instead of regenerating the file.
 */

/** A byte range [start, end) inside a source file. */
export type Range = [start: number, end: number];

/** One file of the keymap, as fetched from the repository. */
export interface SourceFile {
  /** Repo relative path, e.g. `config/sofle.keymap`. */
  path: string;
  /** Current text (may differ from the committed text after edits). */
  text: string;
  /** Blob sha of the version that was loaded, needed to commit. */
  baseSha: string;
  /** True when `text` differs from the loaded version. */
  dirty: boolean;
}

/** A parameter of a binding, possibly nested (`LS(LC(LEFT))`). */
export interface Param {
  /** The literal text of this parameter, e.g. `LS` or `LEFT_GUI`. */
  value: string;
  /** Nested arguments, e.g. `LC(LEFT)` inside `LS(...)`. */
  params: Param[];
  /** Range of this parameter in the source file. */
  range: Range;
}

/** A single key binding, e.g. `&hrl LEFT_GUI A`. */
export interface Binding {
  /** Raw source text of the binding. */
  raw: string;
  /** Behavior name without the `&`, e.g. `hrl`, `kp`, `ok_copy`. */
  behavior: string;
  /** Parameters of the behavior. */
  params: Param[];
  /** Range of the whole binding in the source file. */
  range: Range;
  /** Path of the file this binding lives in. */
  file: string;
}

/** A layer of the keymap (`Default_layer { bindings = <...>; }`). */
export interface Layer {
  /** Node name, e.g. `Default_layer`. */
  id: string;
  /** Human readable label from the `label = "..."` property, if any. */
  label?: string;
  /** Ordinal position of the layer in the keymap. */
  index: number;
  /** Bindings, one per key of the physical layout. */
  bindings: Binding[];
  /** Range of the whole `bindings = <...>` property. */
  bindingsRange: Range;
  /** Range of the layer node itself. */
  nodeRange: Range;
  /** Path of the file the layer lives in. */
  file: string;
}

/** A behavior, either built into ZMK or defined in the keymap. */
export interface BehaviorDef {
  /** Label used to reference it, e.g. `ok_copy`. */
  label: string;
  /** Node name, usually identical to the label. */
  name: string;
  /** Compatible string, e.g. `zmk,behavior-os-key`. */
  compatible: string;
  /** Number of binding cells (`#binding-cells`). */
  cells: number;
  /** Where it came from. */
  source: 'builtin' | 'keymap';
  /** File it was defined in, for keymap behaviors. */
  file?: string;
}

/** A macro (`macros { wp1: wp1 { ... } }`). */
export interface MacroDef {
  label: string;
  name: string;
  /** Raw binding strings of the macro. */
  bindings: string[];
  file: string;
  /** Range of the macro node. */
  nodeRange: Range;
}

/** A combo (`combos { cmbTab { key-positions = <1 2>; ... } }`). */
export interface ComboDef {
  label: string;
  name: string;
  /** Key positions the combo listens on. */
  positions: number[];
  file: string;
  nodeRange: Range;
}

/** A parse problem, reported per file. */
export interface ParseIssue {
  file: string;
  message: string;
  range?: Range;
}

/** Everything the editor knows about a loaded keymap. */
export interface KeymapModel {
  /** All files that make up the keymap (the keymap plus its includes). */
  files: Record<string, SourceFile>;
  /** Layers in keymap order. */
  layers: Layer[];
  /** All known behaviors: built-ins plus the ones defined in the keymap. */
  behaviors: BehaviorDef[];
  /** Macros defined in the keymap. */
  macros: MacroDef[];
  /** Combos defined in the keymap. */
  combos: ComboDef[];
  /** `#define NAME value` pairs found in the keymap. */
  defines: Record<string, string>;
  /** Local includes that were resolved. */
  includes: string[];
  /** Parse problems. */
  errors: ParseIssue[];
}

/** A physical layout, in keyboard-layout-editor format. */
export interface LayoutKey {
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  width2?: number;
  height2?: number;
  /** Legend override for the physical key. */
  label?: string;
  /** Rotation in degrees. */
  angle?: number;
  /** Text color override. */
  color?: string;
}

export type Layout = LayoutKey[];

/** A keyboard the editor can edit, as declared in `config/keyboards.yaml`. */
export interface KeyboardDef {
  id: string;
  label: string;
  /** Path of the keymap file. */
  keymap: string;
  /** Name of the bundled layout to draw it with. */
  layout: string;
}

/** Which part of a binding the picker is editing. */
export type SlotKind = 'tap' | 'hold' | 'shifted';

/** A choice offered by the picker. */
export interface PickerOption {
  kind: 'keycode' | 'behavior' | 'macro' | 'none';
  /** Behavior or keycode name without `&`. */
  code: string;
  /** Text shown in the list. */
  label: string;
  /** Extra text shown next to the label. */
  detail?: string;
  /** How many parameters this option takes. */
  cells: number;
  /** Built-in behavior template, e.g. `kp`. */
  template?: string;
}

/** A pending edit, before it is applied to the model. */
export interface Edit {
  file: string;
  range: Range;
  /** New text for that range. */
  text: string;
}
