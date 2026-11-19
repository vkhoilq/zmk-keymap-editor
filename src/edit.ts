import type { Binding, PickerOption, SlotKind } from './types';

/**
 * Turning a pick from the picker into the text of a binding.
 *
 * Hold-tap style bindings (`&hrl LEFT_GUI A`) have two meaningful slots: the
 * modifier that is held and the key that is tapped. Editing one of them keeps
 * the rest of the binding intact, so switching a tap from `A` to `B` does not
 * throw away the modifier.
 */

const HOLD_TAP = ['hrl', 'hrm', 'lt', 'mt', 'layer_tap_repeat'];

function isHoldTap(binding: Binding): boolean {
  return HOLD_TAP.includes(binding.behavior);
}

/** The text of a picked option, including its parameters. */
export function pickedText(picked: PickerOption, params: string[]): string {
  switch (picked.kind) {
    case 'keycode':
      return `&kp ${picked.code}`;
    case 'macro':
      return `&${picked.code}`;
    case 'none':
      return '&none';
    default:
      return params.length > 0 ? `&${picked.code} ${params.join(' ')}` : `&${picked.code}`;
  }
}

/** The key a pick represents, used when filling a hold-tap slot. */
function pickedKey(picked: PickerOption): string {
  return picked.template ?? picked.code;
}

/**
 * Build the new binding text for a slot.
 *
 * `current` may be undefined for a key that has no binding yet.
 */
export function composeBinding(
  current: Binding | undefined,
  slot: SlotKind,
  picked: PickerOption,
  params: string[] = [],
): string {
  const replacement = pickedText(picked, params);

  if (!current) return replacement;

  // Hold-tap: keep the other half of the binding intact.
  if (isHoldTap(current)) {
    const values = current.params.map((param) => param.value);
    if (values.length >= 2) {
      if (slot === 'tap') {
        values[values.length - 1] = pickedKey(picked);
        return `&${current.behavior} ${values.join(' ')}`;
      }
      if (slot === 'hold') {
        values[0] = pickedKey(picked);
        return `&${current.behavior} ${values.join(' ')}`;
      }
    }
  }

  // Shifted variants of a plain key press, e.g. `&kp LS(SPACE)`.
  if (slot === 'shifted' && current.behavior === 'kp' && current.params.length === 1) {
    const value = current.params[0].value;
    if (value.startsWith('LS(') && value.endsWith(')')) {
      return `&kp LS(${pickedKey(picked)})`;
    }
  }

  return replacement;
}

/** A short description of a binding, used in the picker header. */
export function describeBinding(binding: Binding | undefined): string | null {
  if (!binding) return null;
  if (binding.behavior === 'none') return 'None';
  return binding.raw || `&${binding.behavior}`;
}
