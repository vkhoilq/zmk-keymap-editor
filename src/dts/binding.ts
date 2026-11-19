import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { Binding, Param, Range } from '../types';

/**
 * Parsing and serialising of the contents of a `bindings = < ... >` property.
 *
 * A binding looks like `&behavior param1 param2`, where a parameter can be
 * nested (`LS(LC(LEFT))`). The parser keeps the byte range of every binding
 * and parameter so that an edit can be written back as a minimal patch.
 */

/** Turn a node into a parameter, recursing into call expressions. */
function parseParam(node: SyntaxNode): Param {
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    const args = node.childForFieldName('arguments');
    const inner: Param[] = [];
    if (args) {
      for (const arg of args.namedChildren) inner.push(parseParam(arg));
    }
    return {
      value: fn?.text ?? node.text,
      params: inner,
      range: [node.startIndex, node.endIndex],
    };
  }

  return {
    value: node.text.trim(),
    params: [],
    range: [node.startIndex, node.endIndex],
  };
}

/** Parse the `< ... >` content of a bindings property into bindings. */
export function parseBindings(cells: SyntaxNode, file: string): Binding[] {
  const bindings: Binding[] = [];

  let current: Binding | null = null;

  for (const child of cells.namedChildren) {
    if (child.type === 'reference') {
      const text = child.text;
      // `&kp` or `&some_label` or `&/path/to/label`
      const name = text.replace(/^&/, '');
      current = {
        raw: text,
        behavior: name,
        params: [],
        range: [child.startIndex, child.endIndex],
        file,
      };
      bindings.push(current);
      continue;
    }

    if (!current) continue;

    const param = parseParam(child);
    current.params.push(param);
    current.range = [current.range[0], param.range[1]];
    current.raw = '';
  }

  // The raw text is only known once all params are collected.
  for (const binding of bindings) {
    binding.raw = serializeBinding(binding);
  }

  return bindings;
}

/** Render a parameter back to source text. */
export function serializeParam(param: Param): string {
  if (param.params.length === 0) return param.value;
  const inner = param.params.map(serializeParam).join(',');
  return `${param.value}(${inner})`;
}

/** Render a binding back to source text. */
export function serializeBinding(binding: Binding): string {
  const params = binding.params.map(serializeParam);
  return [`&${binding.behavior}`, ...params].join(' ');
}

/**
 * Build a binding from a behavior name and plain string parameters.
 * Used when the user picks something in the picker.
 */
export function makeBinding(behavior: string, params: string[], file: string): Binding {
  const parsed: Param[] = params.map((value) => ({
    value,
    params: [],
    range: [0, 0] as Range,
  }));
  return {
    raw: '',
    behavior,
    params: parsed,
    range: [0, 0],
    file,
  };
}

/** Short human readable legend for a binding, used on the keycaps. */
export function bindingLegend(binding: Binding | undefined): string {
  if (!binding) return '';
  const params = binding.params.map((p) => p.value);

  switch (binding.behavior) {
    case 'kp':
      return params[0] ?? '';
    case 'none':
      return '';
    case 'trans':
      return '▽';
    case 'mo':
      return params[0] ?? '';
    case 'lt':
    case 'mt':
    case 'layer_tap_repeat':
      return params[params.length - 1] ?? binding.behavior;
    case 'hrl':
    case 'hrm':
      // hold-tap: the last parameter is the tapped key
      return params[params.length - 1] ?? '';
    default:
      return params.length ? params[params.length - 1] : binding.behavior;
  }
}

/** Modifier glyphs for hold-tap style bindings, shown next to the key legend. */
const MODIFIER_GLYPHS: Record<string, string> = {
  LEFT_CONTROL: '⌃',
  RIGHT_CONTROL: '⌃',
  LEFT_SHIFT: '⇧',
  RIGHT_SHIFT: '⇧',
  LEFT_ALT: '⌥',
  RIGHT_ALT: '⌥',
  LEFT_GUI: '⌘',
  RIGHT_GUI: '⌘',
};

export function bindingHoldGlyph(binding: Binding | undefined): string {
  if (!binding) return '';
  if (!['hrl', 'hrm', 'lt', 'mt'].includes(binding.behavior)) return '';
  const first = binding.params[0]?.value;
  return first ? (MODIFIER_GLYPHS[first] ?? first) : '';
}
