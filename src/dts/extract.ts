import type { Parser, Node as SyntaxNode } from 'web-tree-sitter';
import type {
  BehaviorDef,
  ComboDef,
  KeymapModel,
  Layer,
  MacroDef,
  ParseIssue,
  SourceFile,
} from '../types';
import {
  childNode,
  cellsProperty,
  intProperty,
  nodeLabels,
  nodeName,
  parseText,
  stringProperty,
} from './lang';
import { parseBindings } from './binding';

interface FileExtraction {
  layers: Layer[];
  behaviors: BehaviorDef[];
  macros: MacroDef[];
  combos: ComboDef[];
  defines: Record<string, string>;
  includes: string[];
  errors: ParseIssue[];
}

/** Find the root `/ { ... }` node of a document. */
function rootNode(tree: ReturnType<typeof parseText>): SyntaxNode | null {
  for (const child of tree.rootNode.namedChildren) {
    if (child.type !== 'node') continue;
    const name = child.childForFieldName('name')?.text ?? '';
    if (name === '/') return child;
  }
  return null;
}

/** Collect syntax errors as readable issues. */
function collectErrors(file: string, tree: ReturnType<typeof parseText>): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const walk = (node: SyntaxNode) => {
    if (node.type === 'ERROR' || node.isMissing) {
      issues.push({
        file,
        message: node.isMissing
          ? `missing ${node.type}`
          : `syntax error near "${tree.rootNode.text
              .slice(node.startIndex, Math.min(node.endIndex, node.startIndex + 40))
              .replace(/\n/g, ' ')}"`,
        range: [node.startIndex, node.endIndex],
      });
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(tree.rootNode);
  return issues;
}

/** Extract the layers of a `/keymap` node. */
function extractLayers(keymap: SyntaxNode, file: string): Layer[] {
  const layers: Layer[] = [];
  const layerNodes = keymap.namedChildren.filter((child) => child.type === 'node');
  layerNodes.forEach((node, index) => {
    const cells = cellsProperty(node, 'bindings');
    const bindings = cells ? parseBindings(cells, file) : [];
    layers.push({
      id: nodeName(node),
      label: stringProperty(node, 'label'),
      index,
      bindings,
      bindingsRange: cells ? [cells.startIndex, cells.endIndex] : [0, 0],
      nodeRange: [node.startIndex, node.endIndex],
      file,
    });
  });

  return layers;
}

/** Extract the behaviors of a `/behaviors` node. */
function extractBehaviors(behaviors: SyntaxNode, file: string): BehaviorDef[] {
  const out: BehaviorDef[] = [];
  for (const node of behaviors.namedChildren) {
    if (node.type !== 'node') continue;
    const labels = nodeLabels(node);
    const name = nodeName(node);
    out.push({
      label: labels[0] ?? name,
      name,
      compatible: stringProperty(node, 'compatible') ?? '',
      cells: intProperty(node, '#binding-cells') ?? 0,
      source: 'keymap',
      file,
    });
  }
  return out;
}

/** Extract the macros of a `/macros` node. */
function extractMacros(macros: SyntaxNode, file: string): MacroDef[] {
  const out: MacroDef[] = [];
  for (const node of macros.namedChildren) {
    if (node.type !== 'node') continue;
    const labels = nodeLabels(node);
    const name = nodeName(node);
    const cells = cellsProperty(node, 'bindings');
    out.push({
      label: labels[0] ?? name,
      name,
      bindings: cells ? parseBindings(cells, file).map((b) => b.raw) : [],
      file,
      nodeRange: [node.startIndex, node.endIndex],
    });
  }
  return out;
}

/** Extract the combos of a `/combos` node. */
function extractCombos(combos: SyntaxNode, file: string): ComboDef[] {
  const out: ComboDef[] = [];
  for (const node of combos.namedChildren) {
    if (node.type !== 'node') continue;
    const labels = nodeLabels(node);
    const name = nodeName(node);
    const positionsProp = cellsProperty(node, 'key-positions');
    const positions = positionsProp
      ? positionsProp.namedChildren
          .map((c) => Number.parseInt(c.text.trim(), 10))
          .filter((n) => !Number.isNaN(n))
      : [];
    out.push({
      label: labels[0] ?? name,
      name,
      positions,
      file,
      nodeRange: [node.startIndex, node.endIndex],
    });
  }
  return out;
}

/**
 * Extract `#define NAME value` pairs and local includes.
 *
 * Directives can sit at the document level (before the root node) or inside
 * it, so every container is scanned.
 */
function extractDirectives(...containers: SyntaxNode[]): {
  defines: Record<string, string>;
  includes: string[];
} {
  const defines: Record<string, string> = {};
  const includes: string[] = [];

  for (const container of containers) {
    for (const child of container.namedChildren) {
      if (child.type === 'preproc_def') {
        const name = child.namedChildren[0]?.text.trim();
        const value = child.namedChildren[1]?.text.trim() ?? '';
        if (name) defines[name] = value;
      }
      if (child.type === 'preproc_include') {
        const literal = child.namedChildren.find((c) => c.type === 'string_literal');
        if (literal) {
          const path = literal.text.replace(/^"|"$/g, '');
          if (!includes.includes(path)) includes.push(path);
        }
      }
    }
  }

  return { defines, includes };
}

/** Extract everything interesting from a single file. */
export function extractFile(
  parser: Parser,
  file: SourceFile,
): FileExtraction {
  const tree = parseText(parser, file.text);
  // A keymap has a root `/ { ... }` node, an included fragment does not, so
  // fall back to the document itself for files that only contain nodes.
  const root = rootNode(tree) ?? tree.rootNode;
  const errors = collectErrors(file.path, tree);

  if (!root) {
    return {
      layers: [],
      behaviors: [],
      macros: [],
      combos: [],
      defines: {},
      includes: [],
      errors,
    };
  }

  // `#define` and `#include` directives live at the document level as well as
  // inside the root node, so both are scanned.
  const { defines, includes } = extractDirectives(tree.rootNode, root);

  const keymap = childNode(root, 'keymap');
  const behaviors = childNode(root, 'behaviors');
  const macros = childNode(root, 'macros');
  const combos = childNode(root, 'combos');

  return {
    layers: keymap ? extractLayers(keymap, file.path) : [],
    behaviors: behaviors ? extractBehaviors(behaviors, file.path) : [],
    macros: macros ? extractMacros(macros, file.path) : [],
    combos: combos ? extractCombos(combos, file.path) : [],
    defines,
    includes,
    errors,
  };
}

/** Built-in ZMK behaviors the editor always offers. */
export const BUILTIN_BEHAVIORS: BehaviorDef[] = [
  { label: 'kp', name: 'kp', compatible: 'zmk,behavior-key-press', cells: 1, source: 'builtin' },
  { label: 'none', name: 'none', compatible: 'zmk,behavior-none', cells: 0, source: 'builtin' },
  { label: 'trans', name: 'trans', compatible: 'zmk,behavior-transparent', cells: 0, source: 'builtin' },
  { label: 'mo', name: 'mo', compatible: 'zmk,behavior-layer', cells: 1, source: 'builtin' },
  { label: 'to', name: 'to', compatible: 'zmk,behavior-to-layer', cells: 1, source: 'builtin' },
  { label: 'tog', name: 'tog', compatible: 'zmk,behavior-toggle-layer', cells: 1, source: 'builtin' },
  { label: 'lt', name: 'lt', compatible: 'zmk,behavior-hold-tap', cells: 2, source: 'builtin' },
  { label: 'mt', name: 'mt', compatible: 'zmk,behavior-mod-tap', cells: 2, source: 'builtin' },
  { label: 'sk', name: 'sk', compatible: 'zmk,behavior-sticky-key', cells: 1, source: 'builtin' },
  { label: 'caps_word', name: 'caps_word', compatible: 'zmk,behavior-caps-word', cells: 0, source: 'builtin' },
  { label: 'key_repeat', name: 'key_repeat', compatible: 'zmk,behavior-key-repeat', cells: 0, source: 'builtin' },
  { label: 'mmv', name: 'mmv', compatible: 'zmk,behavior-input-two-axis', cells: 1, source: 'builtin' },
  { label: 'msc', name: 'msc', compatible: 'zmk,behavior-input-two-axis', cells: 1, source: 'builtin' },
  { label: 'mkp', name: 'mkp', compatible: 'zmk,behavior-mouse-key-press', cells: 1, source: 'builtin' },
  { label: 'bt', name: 'bt', compatible: 'zmk,behavior-bluetooth', cells: 1, source: 'builtin' },
  { label: 'out', name: 'out', compatible: 'zmk,behavior-output', cells: 1, source: 'builtin' },
  { label: 'bootloader', name: 'bootloader', compatible: 'zmk,behavior-bootloader', cells: 0, source: 'builtin' },
  { label: 'sys_reset', name: 'sys_reset', compatible: 'zmk,behavior-system-reset', cells: 0, source: 'builtin' },
];

/**
 * Build the merged model for a keymap.
 *
 * `files` contains the keymap plus every local include that was resolved.
 * Layers come from the keymap file, behaviors/macros/combos from all files.
 */
export function buildModel(
  parser: Parser,
  files: Record<string, SourceFile>,
  mainPath: string,
): KeymapModel {
  const perFile = new Map<string, FileExtraction>();
  for (const [path, file] of Object.entries(files)) {
    perFile.set(path, extractFile(parser, file));
  }

  const main = perFile.get(mainPath);
  const all = [...perFile.values()];

  const behaviors = [...BUILTIN_BEHAVIORS];
  const seen = new Set(behaviors.map((b) => b.label));
  for (const behavior of all.flatMap((f) => f.behaviors)) {
    if (seen.has(behavior.label)) continue;
    seen.add(behavior.label);
    behaviors.push(behavior);
  }

  const defines: Record<string, string> = {};
  for (const file of all) Object.assign(defines, file.defines);

  return {
    files,
    layers: main?.layers ?? [],
    behaviors,
    macros: all.flatMap((f) => f.macros),
    combos: all.flatMap((f) => f.combos),
    defines,
    includes: all.flatMap((f) => f.includes),
    errors: all.flatMap((f) => f.errors),
  };
}
