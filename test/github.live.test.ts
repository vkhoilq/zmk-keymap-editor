import { describe, expect, it } from 'vitest';
import * as gh from '../src/github/client';
import { localIncludes, resolveInclude } from '../src/store';

/**
 * Live test against a real repository.
 *
 * It only reads, never commits. Set GITHUB_TOKEN to run it:
 *
 *   GITHUB_TOKEN=$(gh auth token) npx vitest run test/github.live.test.ts
 */
const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_OWNER ?? 'vkhoilq';
const repo = process.env.GITHUB_REPO ?? 'zmk-keyboards';

describe.skipIf(!token)('github client (live)', () => {
  const ref = { owner, repo, branch: 'main' };

  it('lists the config directory', async () => {
    const entries = await gh.listDirectory(ref, token as string, 'config');
    const names = entries.map((entry) => entry.name);
    expect(names).toContain('corne.keymap');
    expect(names).toContain('sofle.keymap');
    expect(names).toContain('keyboards.yaml');
  });

  it('reads a file with its sha', async () => {
    const file = await gh.getFile(ref, token as string, 'config/corne.keymap');
    expect(file.text).toContain('zmk,keymap');
    expect(file.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('finds and reads the included library', async () => {
    const keymap = await gh.getFile(ref, token as string, 'config/corne.keymap');
    const includes = localIncludes(keymap.text);
    expect(includes).toEqual(['lib/keymap-behaviors.dtsi']);

    const resolved = resolveInclude('config/corne.keymap', includes[0]);
    expect(resolved).toBe('config/lib/keymap-behaviors.dtsi');

    const lib = await gh.getFile(ref, token as string, resolved as string);
    expect(lib.text).toContain('ok_copy');
  });

  it('reads the keyboard manifest', async () => {
    const file = await gh.getFile(ref, token as string, 'config/keyboards.yaml');
    expect(file.text).toContain('corne');
    expect(file.text).toContain('sofle');
  });

  it('returns the head commit and tree', async () => {
    const commit = await gh.getHeadCommit(ref, token as string);
    const tree = await gh.getHeadTree(ref, token as string);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    expect(tree).toMatch(/^[0-9a-f]{40}$/);
  });
});
