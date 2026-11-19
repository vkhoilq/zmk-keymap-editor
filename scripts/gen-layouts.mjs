/**
 * Generates the physical layouts used by the editor.
 *
 * The layouts are taken from ZMK's own physical layout definitions, which are
 * in the same order as the keymap positions, so the n-th key of a layer maps
 * to the n-th key of the layout.
 *
 * Usage: node scripts/gen-layouts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZMK_TAG = 'v0.3.0';
const LAYOUTS = [
  {
    id: 'corne_6col',
    zmkPath: 'app/dts/layouts/foostan/corne/6column.dtsi',
  },
  {
    id: 'sofle',
    zmkPath: 'app/dts/layouts/josefadamcik/sofle.dtsi',
  },
];

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'layouts');

async function fetchLayout(zmkPath) {
  const url = `https://raw.githubusercontent.com/zmkfirmware/zmk/${ZMK_TAG}/${zmkPath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
  return response.text();
}

/** Parse the `keys = < ... >` list of a physical layout. */
function parseKeys(source) {
  const start = source.indexOf('keys');
  const open = source.indexOf('<', start);
  const close = source.indexOf('>;', open);
  const body = source.slice(open + 1, close);

  const keys = [];
  for (const entry of body.split(/,\s*</)) {
    const numbers = entry.match(/-?\d+/g);
    if (!numbers || numbers.length < 4) continue;
    const [w, h, x, y] = numbers.map(Number);
    keys.push({
      x: round(x / 100),
      y: round(y / 100),
      width: round(w / 100),
      height: round(h / 100),
    });
  }
  return keys;
}

const round = (n) => Math.round(n * 1000) / 1000;

for (const layout of LAYOUTS) {
  const source = await fetchLayout(layout.zmkPath);
  const keys = parseKeys(source);
  if (keys.length === 0) throw new Error(`no keys parsed for ${layout.id}`);
  fs.writeFileSync(
    path.join(outDir, `${layout.id}.json`),
    `${JSON.stringify(keys, null, 2)}\n`,
  );
  console.log(`${layout.id}: ${keys.length} keys -> src/layouts/${layout.id}.json`);
}
