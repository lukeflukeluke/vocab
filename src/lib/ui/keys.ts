// Keyboard shortcuts on PC (PLAN 13.6): 1-4 to answer, Enter to go on, Space to reveal,
// H for a hint, ? for "I don't know". These helpers keep them out of the way of typing.

/** True when the key press is typing into a text box. */
export function typingInField(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** True when a button has focus: Enter and Space already press it. */
export function onButton(event: KeyboardEvent): boolean {
  return (event.target as HTMLElement | null)?.tagName === 'BUTTON';
}

/** True for presses with Ctrl, Cmd or Alt held, which belong to the browser. */
export function withModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}
