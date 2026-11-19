import { Parser, Language, type Tree, type Node as SyntaxNode } from 'web-tree-sitter';

let parserPromise: Promise<Parser> | null = null;

/**
 * Load the devicetree grammar and create a parser.
 *
 * The wasm binary lives in `public/` so the browser can fetch it, and the
 * same file is loaded from disk in the node based tests.
 */
export async function getParser(wasmUrl: string): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init();
      const language = await Language.load(wasmUrl);
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
  }
  return parserPromise;
}

export function parseText(parser: Parser, text: string): Tree {
  const tree = parser.parse(text);
  if (!tree) throw new Error('the devicetree parser returned no tree');
  return tree;
}

/** All named children of a node. */
export function children(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren;
}

/** The value of a node's `name` field, e.g. the node name. */
export function nodeName(node: SyntaxNode): string {
  return node.childForFieldName('name')?.text ?? '';
}

/** All labels attached to a node, e.g. `hrl:` in `hrl: hrl { ... }`. */
export function nodeLabels(node: SyntaxNode): string[] {
  return node
    .childrenForFieldName('label')
    .map((child) => child.text.replace(/:$/, ''));
}

/** Find a direct child node with the given name. */
export function childNode(node: SyntaxNode, name: string): SyntaxNode | null {
  for (const child of children(node)) {
    if (child.type === 'node' && nodeName(child) === name) return child;
  }
  return null;
}

/** Find all direct child nodes with the given name. */
export function childNodes(node: SyntaxNode, name: string): SyntaxNode[] {
  return children(node).filter(
    (child) => child.type === 'node' && nodeName(child) === name,
  );
}

/** Read a property of a node, e.g. `compatible = "zmk,behavior-os-key"`. */
export function property(node: SyntaxNode, name: string): SyntaxNode | null {
  for (const child of children(node)) {
    if (child.type !== 'property') continue;
    const propName = child.childForFieldName('name')?.text;
    if (propName === name) return child;
  }
  return null;
}

/** Text of a string property, without the quotes. */
export function stringProperty(node: SyntaxNode, name: string): string | undefined {
  const prop = property(node, name);
  if (!prop) return undefined;
  const value = prop.childForFieldName('value');
  if (!value) return undefined;
  return value.text.replace(/^"|"$/g, '');
}

/** Text of an integer property, e.g. `#binding-cells = <2>`. */
export function intProperty(node: SyntaxNode, name: string): number | undefined {
  const prop = property(node, name);
  if (!prop) return undefined;
  const value = prop.childForFieldName('value');
  if (!value) return undefined;
  const inner = value.text.replace(/[<>]/g, '').trim();
  const parsed = Number.parseInt(inner, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** The `integer_cells` value of a property, i.e. the `< ... >` part. */
export function cellsProperty(node: SyntaxNode, name: string): SyntaxNode | null {
  const prop = property(node, name);
  if (!prop) return null;
  const value = prop.childForFieldName('value');
  if (!value || value.type !== 'integer_cells') return null;
  return value;
}
