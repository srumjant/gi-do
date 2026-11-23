/**
 * Which device the child is playing with, as the last one they pressed something on, so a
 * prompt names the button in their hands (docs/superpowers/specs/2026-11-23-story-and-
 * transitions-design.md): SPACE on the keyboard, the controller's own glyph, OK on the touch
 * buttons. Set by a real key press (main.ts), a controller button (gamepad.ts's samplePad) and
 * the touch buttons (touchControls.ts); a phone starts on touch (main.ts).
 */
export type InputSource = 'keyboard' | 'pad' | 'touch';

let source: InputSource = 'keyboard';

export function setInputSource(next: InputSource): void {
  source = next;
}

export function inputSource(): InputSource {
  return source;
}

/** The confirm button's name on the device: `pad` is the controller's own glyph for it. */
export function confirmName(pad: string): string {
  return source === 'touch' ? 'OK' : source === 'pad' ? pad : 'SPACE';
}

/** The back button's name on the device (the touch buttons' pause, ❚❚, goes back too). */
export function backName(pad: string): string {
  return source === 'touch' ? '❚❚' : source === 'pad' ? pad : 'ESC';
}
