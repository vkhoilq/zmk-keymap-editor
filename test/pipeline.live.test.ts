import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import * as gh from '../src/github/client';
import { getParser } from '../src/dts/lang';
import { buildModel } from '../src/dts/extract';
import { applyEdits } from '../src/dts/patch';
import { localIncludes, resolveInclude } from '../src/store';
import type { SourceFile } from '../src/types';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER ?? 'vkhoilq';
const repo = process.env.GITHUB_REPO ?? 'zmk-keyboards';
const wasm = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tree-sitter-devicetree.wasm');

/** The same flow the browser uses: manifest -> keymap -> includes -> model. */
async function loadEverything() {
  const ref = { owner, repo, branch: 'main' };
  const entries = await gh.listDirectory(ref, token as string, 'config');
  const manifest = entries.find((entry) => entry.name === 'keyboards.yaml');
  const manifestFile = await gh.getFile(ref, token as string, manifest!.path);
  const keyboards = Object.entries(
    parseYaml(manifestFile.text) as Record<string, { keymap: string; layout: string }>,
  ).map(([id, value]) => ({ id, ...value }));

  const files: Record<string, SourceFile> = {};
  const queue = [keyboards[0].keymap];
  while (queue.length > 0) {
    const filePath = queue.shift() as string;
    if (files[filePath]) continue;
    const file = await gh.getFile(ref, token as string, filePath);
    files[filePath] = { path: filePath, text: file.text, baseSha: file.sha, dirty: false };
    for (const include of localIncludes(file.text)) {
      const resolved = resolveInclude(filePath, include);
      if (resolved) queue.push(resolved);
    }
  }

  const parser = await getParser(wasm);
  const model = buildModel(parser, files, keyboards[0].keymap);
  return { keyboards, files, model };
}

describe.skipIf(!token)('full load pipeline (live)', () => {
  it('loads the corne keymap with its include', async () => {
    const { keyboards, files, model } = await loadEverything();

    expect(keyboards.map((k) => k.id)).toEqual(['corne', 'sofle']);
    expect(Object.keys(files).sort()).toEqual([
      'config/corne.keymap',
      'config/lib/keymap-behaviors.dtsi',
    ]);

    expect(model.errors).toEqual([]);
    expect(model.layers).toHaveLength(12);
    for (const layer of model.layers) expect(layer.bindings).toHaveLength(42);

    expect(model.macros.map((m) => m.label)).toEqual(
      expect.arrayContaining(['wp1', 'wp2', 'mcr_ip', 'mcr_username']),
    );
    expect(model.behaviors.map((b) => b.label)).toContain('ok_copy');
    expect(model.behaviors.map((b) => b.label)).toContain('hrl');
    expect(model.combos.length).toBeGreaterThan(0);
    expect(model.defines.LOWER).toBe('1');
  });

  it('edits a binding and re-parses without losing anything', async () => {
    const { files, model } = await loadEverything();
    const keymap = files['config/corne.keymap'];
    const binding = model.layers[0].bindings[1];
    expect(binding.raw).toBe('&kp Q');

    const patched = applyEdits(keymap.text, [
      { file: keymap.path, range: binding.range, text: '&kp Z' },
    ]);

    const parser = await getParser(wasm);
    const after = buildModel(
      parser,
      { ...files, [keymap.path]: { ...keymap, text: patched } },
      keymap.path,
    );

    expect(after.errors).toEqual([]);
    expect(after.layers[0].bindings[1].raw).toBe('&kp Z');
    expect(after.layers[0].bindings[2].raw).toBe('&kp W');
    expect(after.layers).toHaveLength(12);
    expect(after.macros).toHaveLength(4);
  });
});
