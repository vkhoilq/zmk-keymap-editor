import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { getParser } from '../src/dts/lang';
import { buildModel, extractFile } from '../src/dts/extract';
import type { Parser } from 'web-tree-sitter';
import type { SourceFile } from '../src/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const wasm = path.join(here, '..', 'public', 'tree-sitter-devicetree.wasm');
const hasFixtures = fs.existsSync(path.join(fixtures, 'corne.keymap'));

function file(relative: string): SourceFile {
  const full = path.join(fixtures, relative);
  return {
    path: relative,
    text: fs.readFileSync(full, 'utf8'),
    baseSha: 'test',
    dirty: false,
  };
}

describe.skipIf(!hasFixtures)('dts parser', () => {
  let parser: Parser;

  beforeAll(async () => {
    parser = await getParser(wasm);
  });

  it('parses the corne keymap without syntax errors', () => {
    const corne = file('corne.keymap');
    const result = extractFile(parser, corne);
    expect(result.errors).toEqual([]);
  });

  it('finds every layer with the right number of bindings', () => {
    const corne = file('corne.keymap');
    const result = extractFile(parser, corne);

    expect(result.layers).toHaveLength(12);
    for (const layer of result.layers) {
      expect(layer.bindings).toHaveLength(42);
    }
    expect(result.layers[0].id).toBe('Default_layer');
    expect(result.layers[0].label).toBe('DEF');
  });

  it('parses the sofle keymap with 60 bindings per layer', () => {
    const sofle = file('sofle.keymap');
    const result = extractFile(parser, sofle);

    expect(result.errors).toEqual([]);
    expect(result.layers).toHaveLength(11);
    for (const layer of result.layers) {
      expect(layer.bindings).toHaveLength(60);
    }
  });

  it('reads the shared behavior library', () => {
    const lib = file('lib/keymap-behaviors.dtsi');
    const result = extractFile(parser, lib);

    expect(result.errors).toEqual([]);
    expect(result.behaviors.length).toBeGreaterThan(40);
    expect(result.behaviors.map((b) => b.label)).toContain('ok_copy');
    expect(result.behaviors.map((b) => b.label)).toContain('leader1');
    // hold-taps stay per board, they are not part of the shared library
    expect(result.behaviors.map((b) => b.label)).not.toContain('hrl');
    expect(result.macros.map((m) => m.label)).toEqual(
      expect.arrayContaining(['wp1', 'wp2', 'mcr_ip', 'mcr_username']),
    );

    const okCopy = result.behaviors.find((b) => b.label === 'ok_copy');
    expect(okCopy?.compatible).toBe('zmk,behavior-os-key');
    expect(okCopy?.cells).toBe(0);
  });

  it('keeps the raw text of every binding so nothing is lost', () => {
    const corne = file('corne.keymap');
    const result = extractFile(parser, corne);
    const layer = result.layers[0];

    expect(layer.bindings[0].raw).toBe('&none');
    expect(layer.bindings[1].raw).toBe('&kp Q');
    expect(layer.bindings[2].raw).toBe('&kp W');

    const holdTap = layer.bindings.find((b) => b.behavior === 'hrl');
    expect(holdTap?.raw).toBe('&hrl LEFT_GUI A');
    expect(holdTap?.params.map((p) => p.value)).toEqual(['LEFT_GUI', 'A']);
  });

  it('parses nested parameters', () => {
    const corne = file('corne.keymap');
    const result = extractFile(parser, corne);
    const layer = result.layers.find((l) => l.id === 'Nav');

    const nested = layer?.bindings.find((b) => b.raw.includes('LS(LA(LC('));
    expect(nested).toBeDefined();
    expect(nested?.params[0].value).toBe('LS');
    expect(nested?.params[0].params[0].value).toBe('LA');
    expect(nested?.params[0].params[0].params[0].value).toBe('LC');
  });

  it('merges the keymap with its include into one model', () => {
    const corne = file('corne.keymap');
    const lib = file('lib/keymap-behaviors.dtsi');
    const model = buildModel(parser, { 'config/corne.keymap': corne, 'config/lib/keymap-behaviors.dtsi': lib }, 'config/corne.keymap');

    expect(model.layers).toHaveLength(12);
    expect(model.macros).toHaveLength(4);
    expect(model.combos.length).toBeGreaterThan(0);
    expect(model.behaviors.map((b) => b.label)).toContain('ok_copy');
    expect(model.behaviors.map((b) => b.label)).toContain('kp');
    expect(model.defines.LOWER).toBe('1');
    expect(model.includes).toContain('lib/keymap-behaviors.dtsi');
  });

  it('finds the local include of a keymap', () => {
    const corne = file('corne.keymap');
    const result = extractFile(parser, corne);
    expect(result.includes).toEqual(['lib/keymap-behaviors.dtsi']);
  });
});
