/**
 * Generates the keycode list from ZMK's own dt-bindings.
 *
 * Usage: node scripts/gen-keycodes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ZMK_TAG = 'v0.3.0';
const BASE = `https://raw.githubusercontent.com/zmkfirmware/zmk/${ZMK_TAG}/app/include/dt-bindings/zmk`;

/** Short display labels for the keycodes that are used most. */
const LABELS = {
  SPACE: '␣',
  BSPC: '⌫',
  RET: '⏎',
  ENTER: '⏎',
  TAB: '↹',
  DEL: '⌦',
  ESC: 'Esc',
  UP: '↑',
  DOWN: '↓',
  LEFT: '←',
  RIGHT: '→',
  LCTRL: 'Ctrl',
  RCTRL: 'Ctrl',
  LALT: 'Alt',
  RALT: 'Alt',
  LGUI: 'Gui',
  RGUI: 'Gui',
  LSHFT: 'Shift',
  RSHFT: 'Shift',
  C_VOLUME_UP: 'Vol+',
  C_VOLUME_DOWN: 'Vol-',
  C_MUTE: 'Mute',
  K_MUTE: 'Mute',
  MINUS: '-',
  EQUAL: '=',
  LPAR: '(',
  RPAR: ')',
  LSQB: '[',
  RSQB: ']',
  SQT: "'",
  BSLSH: '\\',
  GRAVE: '`',
  COMMA: ',',
  PERIOD: '.',
  FSLH: '/',
  BSLSH_ALT: '\\',
  K_ENTER: '⏎',
  CAPS: 'Caps',
  LANG1: 'あ',
  LANG2: '変換',
  LANG3: '無変換',
};

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
  return response.text();
}

/** Map HID_USAGE_* names to their numeric value. */
function parseUsages(source) {
  const usages = new Map();
  for (const match of source.matchAll(
    /^#define\s+(HID_USAGE_[A-Z0-9_]+)\s+\(?\s*(0x[0-9a-fA-F]+)\s*\)?/gm,
  )) {
    usages.set(match[1], Number.parseInt(match[2], 16));
  }
  return usages;
}

/** Keycodes that are worth showing at the top of the picker. */
const COMMON = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N0',
  'SPACE', 'BSPC', 'RET', 'TAB', 'ESC', 'DEL', 'ENTER',
  'LEFT', 'RIGHT', 'UP', 'DOWN', 'LCTRL', 'RCTRL', 'LALT', 'RALT',
  'LGUI', 'RGUI', 'LSHFT', 'RSHFT', 'COMMA', 'PERIOD', 'MINUS', 'EQUAL',
  'LSQB', 'RSQB', 'SQT', 'BSLSH', 'GRAVE', 'FSLH', 'CAPS',
];

const usages = parseUsages(await fetchText(`${BASE}/hid_usage.h`));
const keysSource = await fetchText(`${BASE}/keys.h`);

/** Resolve an alias chain like `SYS_PWR -> SYSTEM_POWER -> <usage>`. */
function resolveUsage(expression, depth = 0) {
  if (depth > 8) return undefined;

  const direct = expression.match(/ZMK_HID_USAGE\(HID_USAGE_[A-Z0-9_]+,\s*(HID_USAGE_[A-Z0-9_]+)\)/);
  if (direct) return usages.get(direct[1]);

  const alias = expression.match(/^\(?\s*([A-Z0-9_]+)\s*\)?$/);
  if (alias) {
    const name = alias[1];
    const definition = keysSource.match(new RegExp(`^#define\\s+${name}\\s+(.+)$`, 'm'));
    if (definition) return resolveUsage(definition[1].trim(), depth + 1);
  }

  return undefined;
}

const keycodes = [];
let description = '';

for (const line of keysSource.split('\n')) {
  const comment = line.match(/^\s*\/\*\s*(.*?)\s*\*\/\s*$/);
  if (comment) {
    description = comment[1];
    continue;
  }

  const define = line.match(/^#define\s+([A-Z0-9_]+)\s+(.+)$/);
  if (!define) continue;

  const [, name, expression] = define;
  const usage = resolveUsage(expression.trim());
  const label = LABELS[name] ?? name.replace(/^C_/, '').replace(/_/g, ' ');

  keycodes.push({
    code: name,
    label,
    usage: usage === undefined ? null : `0x${usage.toString(16).padStart(2, '0')}`,
    description,
    common: COMMON.includes(name),
  });
}

const outFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'zmk',
  'keycodes.json',
);
fs.writeFileSync(outFile, `${JSON.stringify(keycodes, null, 0)}\n`);
console.log(`${keycodes.length} keycodes -> src/zmk/keycodes.json`);
