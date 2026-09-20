// A recording stand-in for AudioContext. It models the shape the synth uses and
// nothing else: what was created, what it was connected to, and every scheduled
// parameter change with its timestamp.

export interface RampCall {
  param: string;
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
  value: number;
  time: number;
}

export class FakeParam {
  value = 0;
  calls: RampCall[] = [];

  constructor(private readonly name: string, private readonly log: RampCall[]) {}

  private record(method: RampCall['method'], value: number, time: number): this {
    const call: RampCall = { param: this.name, method, value, time };
    this.calls.push(call);
    this.log.push(call);
    return this;
  }

  setValueAtTime(value: number, time: number): this {
    return this.record('setValueAtTime', value, time);
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.record('linearRampToValueAtTime', value, time);
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    return this.record('exponentialRampToValueAtTime', value, time);
  }
}

export class FakeOscillator {
  type = 'sine';
  frequency: FakeParam;
  started: number | null = null;
  stopped: number | null = null;
  connectedTo: unknown[] = [];

  constructor(log: RampCall[]) {
    this.frequency = new FakeParam('frequency', log);
  }

  connect(target: unknown): unknown { this.connectedTo.push(target); return target; }
  start(at = 0): void { this.started = at; }
  stop(at = 0): void { this.stopped = at; }
}

export class FakeGain {
  gain: FakeParam;
  connectedTo: unknown[] = [];

  constructor(log: RampCall[]) {
    this.gain = new FakeParam('gain', log);
  }

  connect(target: unknown): unknown { this.connectedTo.push(target); return target; }
}

export class FakeAudioContext {
  currentTime = 0;
  destination = { kind: 'destination' as const };
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  /** Every scheduled parameter change across every node, in call order. */
  schedule: RampCall[] = [];

  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator(this.schedule);
    this.oscillators.push(osc);
    return osc;
  }

  createGain(): FakeGain {
    const gain = new FakeGain(this.schedule);
    this.gains.push(gain);
    return gain;
  }

  /** Advance the audio clock, the way time passing would. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}
