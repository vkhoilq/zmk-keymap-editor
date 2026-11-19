import type { Edit, Range } from '../types';

/**
 * Patching and diffing of source files.
 *
 * Edits are byte range replacements, so applying them keeps every other byte
 * of the file - comments, formatting and unrelated layers - exactly as it was.
 */

/** Apply edits to a text. Edits must not overlap. */
export function applyEdits(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.range[0] - a.range[0]);
  let out = text;
  let lastStart = Infinity;

  for (const edit of sorted) {
    const [start, end] = edit.range;
    if (end > lastStart) {
      throw new Error('overlapping edits are not supported');
    }
    out = out.slice(0, start) + edit.text + out.slice(end);
    lastStart = start;
  }

  return out;
}

/** Replace one range of a text. */
export function replaceRange(text: string, range: Range, replacement: string): string {
  return text.slice(0, range[0]) + replacement + text.slice(range[1]);
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

/** Longest common subsequence based line diff. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');

  // Trim the common prefix and suffix, it makes the LCS table much smaller.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const rows = midA.length;
  const cols = midB.length;
  const table: Uint32Array = new Uint32Array((rows + 1) * (cols + 1));

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i * (cols + 1) + j] =
        midA[i] === midB[j]
          ? table[(i + 1) * (cols + 1) + j + 1] + 1
          : Math.max(table[(i + 1) * (cols + 1) + j], table[i * (cols + 1) + j + 1]);
    }
  }

  const result: DiffLine[] = [];
  for (let i = 0; i < start; i++) {
    result.push({ type: 'context', text: a[i], oldLine: i + 1, newLine: i + 1 });
  }

  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (midA[i] === midB[j]) {
      result.push({
        type: 'context',
        text: midA[i],
        oldLine: start + i + 1,
        newLine: start + j + 1,
      });
      i++;
      j++;
    } else if (table[(i + 1) * (cols + 1) + j] >= table[i * (cols + 1) + j + 1]) {
      result.push({ type: 'remove', text: midA[i], oldLine: start + i + 1, newLine: null });
      i++;
    } else {
      result.push({ type: 'add', text: midB[j], oldLine: null, newLine: start + j + 1 });
      j++;
    }
  }
  while (i < rows) {
    result.push({ type: 'remove', text: midA[i], oldLine: start + i + 1, newLine: null });
    i++;
  }
  while (j < cols) {
    result.push({ type: 'add', text: midB[j], oldLine: null, newLine: start + j + 1 });
    j++;
  }

  for (let k = endA; k < a.length; k++) {
    result.push({ type: 'context', text: a[k], oldLine: k + 1, newLine: k - endA + endB + 1 });
  }

  return result;
}

/** Render a diff as a unified diff string. */
export function formatUnifiedDiff(path: string, oldText: string, newText: string): string {
  const lines = diffLines(oldText, newText);
  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  for (const line of lines) {
    if (line.type === 'context') out.push(` ${line.text}`);
    else if (line.type === 'remove') out.push(`-${line.text}`);
    else out.push(`+${line.text}`);
  }
  return out.join('\n');
}
