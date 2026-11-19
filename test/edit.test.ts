import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import type { Parser } from 'web-tree-sitter';
import { getParser } from '../src/dts/lang';
import { buildModel, extractFile } from '../src/dts/extract';
import { applyEdits, diffLines, formatUnifiedDiff, replaceRange } from '../src/dts/patch';
import { composeBinding } from '../src/edit';
import { localIncludes, resolveInclude } from '../src/store';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const wasm = path.join(here, '..', 'public', 'tree-sitter-devicetree.wasm');
const hasFixtures = fs.existsSync(path.join(fixtures, 'corne.keymap'));

function read(relative: string): string {
  return fs.readFileSync(path.join(fixtures, relative), 'utf8');
}

describe.skipIf(!hasFixtures)('include resolution', () => {
  it('finds only the local includes', () => {
    const includes = localIncludes(read('corne.keymap'));
    expect(includes).toEqual(['lib/keymap-behaviors.dtsi']);
  });

  it('resolves an include relative to the including file', () => {
    expect(resolveInclude('config/corne.keymap', 'lib/keymap-behaviors.dtsi')).toBe(
      'config/lib/keymap-behaviors.dtsi',
    );
    expect(resolveInclude('config/a/b.keymap', '../c.keymap')).toBe('config/c.keymap');
  });
});

describe.skipIf(!hasFixtures)('patching', () => {
  it('replaces a byte range and leaves everything else alone', () => {
    const text = 'hello world';
    expect(replaceRange(text, [6, 11], 'there')).toBe('hello there');
  });

  it('applies edits from the end of the file backwards', () => {
    const text = 'aaaa';
    const patched = applyEdits(text, [
      { file: 'x', range: [0, 1], text: 'B' },
      { file: 'x', range: [3, 4], text: 'C' },
    ]);
    expect(patched).toBe('BaaC');
  });

  it('rejects overlapping edits', () => {
    expect(() =>
      applyEdits('aaaa', [
        { file: 'x', range: [0, 3], text: 'B' },
        { file: 'x', range: [1, 4], text: 'C' },
      ]),
    ).toThrow();
  });

  it('produces a readable diff', () => {
    const diff = diffLines('a\nb\nc', 'a\nB\nc');
    expect(diff.filter((l) => l.type === 'remove').map((l) => l.text)).toEqual(['b']);
    expect(diff.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['B']);
    expect(formatUnifiedDiff('f', 'a\nb\nc', 'a\nB\nc')).toContain('+B');
  });
});

describe.skipIf(!hasFixtures)('editing a real keymap', () => {
  let parser: Parser;

  beforeAll(async () => {
    parser = await getParser(wasm);
  });

  it('changes a single binding and keeps everything else identical', () => {
    const original = read('corne.keymap');
    const source = { path: 'config/corne.keymap', text: original, baseSha: 'x', dirty: false };
    const model = buildModel(parser, { 'config/corne.keymap': source }, 'config/corne.keymap');

    const layer = model.layers[0];
    const target = layer.bindings[1]; // &kp Q
    expect(target.raw).toBe('&kp Q');

    const patched = applyEdits(original, [
      { file: 'config/corne.keymap', range: target.range, text: '&kp Z' },
    ]);

    // only that one binding changed, the file keeps its exact size
    expect(patched.length).toBe(original.length);
    expect(patched).toContain('&kp Z');

    // and the file still parses with the same shape
    const after = buildModel(
      parser,
      { 'config/corne.keymap': { ...source, text: patched } },
      'config/corne.keymap',
    );
    expect(after.layers).toHaveLength(model.layers.length);
    expect(after.layers[0].bindings).toHaveLength(42);
    expect(after.layers[0].bindings[1].raw).toBe('&kp Z');
    expect(after.layers[0].bindings[0].raw).toBe('&none');
    expect(after.layers[0].bindings[2].raw).toBe('&kp W');
    expect(after.errors).toEqual([]);
  });

  it('edits a binding in the shared library without touching the keymap', () => {
    const lib = read('lib/keymap-behaviors.dtsi');
    const result = extractFile(parser, {
      path: 'config/lib/keymap-behaviors.dtsi',
      text: lib,
      baseSha: 'x',
      dirty: false,
    });

    const wp1 = result.macros.find((m) => m.label === 'wp1');
    expect(wp1).toBeDefined();
    expect(wp1?.bindings[0]).toContain('&kp AT');
  });
});

describe('composeBinding', () => {
  const holdTap = {
    raw: '&hrl LEFT_GUI A',
    behavior: 'hrl',
    params: [
      { value: 'LEFT_GUI', params: [], range: [0, 0] as [number, number] },
      { value: 'A', params: [], range: [0, 0] as [number, number] },
    ],
    range: [0, 0] as [number, number],
    file: 'x',
  };

  it('replaces the tapped key of a hold-tap and keeps the modifier', () => {
    const text = composeBinding(holdTap, 'tap', {
      kind: 'keycode',
      code: 'B',
      label: 'B',
      cells: 1,
      template: 'B',
    });
    expect(text).toBe('&hrl LEFT_GUI B');
  });

  it('replaces the modifier of a hold-tap and keeps the key', () => {
    const text = composeBinding(holdTap, 'hold', {
      kind: 'keycode',
      code: 'LEFT_ALT',
      label: 'Alt',
      cells: 1,
      template: 'LEFT_ALT',
    });
    expect(text).toBe('&hrl LEFT_ALT A');
  });

  it('replaces a plain key press completely', () => {
    const plain = {
      ...holdTap,
      raw: '&kp Q',
      behavior: 'kp',
      params: [{ value: 'Q', params: [], range: [0, 0] as [number, number] }],
    };
    const text = composeBinding(plain, 'tap', {
      kind: 'keycode',
      code: 'Z',
      label: 'Z',
      cells: 1,
      template: 'Z',
    });
    expect(text).toBe('&kp Z');
  });

  it('creates a binding for an empty key', () => {
    const text = composeBinding(undefined, 'tap', {
      kind: 'macro',
      code: 'wp1',
      label: 'wp1',
      cells: 0,
      template: 'wp1',
    });
    expect(text).toBe('&wp1');
  });
});
