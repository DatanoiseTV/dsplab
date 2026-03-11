export const PRESETS: Record<string, string> = {
  "Minimal": `fun process(input: real) {
  return input;
}

and noteOn(note: int, velocity: int, channel: int) {
}

and noteOff(note: int, channel: int) {
}

and controlChange(control: int, value: int, channel: int) {
}

and default() {
}
`,
};
