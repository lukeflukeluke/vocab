// Pronunciation with the device's own text-to-speech (free, works offline on iPhone).
// A British English voice is preferred, then any English voice.

let chosen: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export function canSpeak(): boolean {
  return synth() !== null;
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
  const british = english.filter((v) => /^en[-_]gb/i.test(v.lang));
  // On-device voices work offline; prefer them.
  const best = (list: SpeechSynthesisVoice[]) => list.find((v) => v.localService) ?? list[0];
  return best(british) ?? best(english) ?? null;
}

/** Loads the voice list early: some browsers fill it in after a moment. */
export function prepareSpeech(): void {
  const s = synth();
  if (!s) return;
  const load = () => (chosen = pickVoice(s.getVoices()) ?? chosen);
  load();
  s.addEventListener?.('voiceschanged', load);
}

/** Says a word or sentence. Call it from a tap or key press: iPhone needs that. */
export function speak(text: string): void {
  const s = synth();
  if (!s) return;
  if (!chosen) chosen = pickVoice(s.getVoices());
  s.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = chosen?.lang ?? 'en-GB';
  if (chosen) utterance.voice = chosen;
  utterance.rate = 0.9;
  s.speak(utterance);
}
