/**
 * Copies the keymap fixtures used by the tests.
 *
 * The fixtures are the real keymap files, so they are not committed (they
 * contain personal macros). They are taken from the keyboard repository
 * instead, which is expected next to this project:
 *
 *   ../zmk-keyboards/config
 *
 * Override the location with ZMK_REPO=/path/to/repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(here, '..');
const source = process.env.ZMK_REPO ?? path.join(project, '..', 'zmk-keyboards');
const from = path.join(source, 'config');
const to = path.join(project, 'test', 'fixtures');

if (!fs.existsSync(from)) {
  console.warn(`[fixtures] ${from} not found, keeping the existing fixtures`);
  process.exit(0);
}

fs.mkdirSync(path.join(to, 'lib'), { recursive: true });

const files = [
  ['corne.keymap', 'corne.keymap'],
  ['sofle.keymap', 'sofle.keymap'],
  [path.join('lib', 'keymap-behaviors.dtsi'), path.join('lib', 'keymap-behaviors.dtsi')],
];

for (const [src, dest] of files) {
  const srcPath = path.join(from, src);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[fixtures] ${srcPath} missing, skipped`);
    continue;
  }
  fs.copyFileSync(srcPath, path.join(to, dest));
  console.log(`[fixtures] ${src} -> test/fixtures/${dest}`);
}
