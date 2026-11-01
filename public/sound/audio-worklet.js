const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

class VehicleSound extends AudioWorkletProcessor {
  constructor() {
    super();
    this.vehicle = 'car';
    this.weights = { car: 1, tractor: 0, jet: 0 };
    this.rpm = 850;
    this.targetRpm = 850;
    this.load = 0;
    this.targetLoad = 0;
    this.phase = { car: 0, tractor: 0, jet: 0 };
    this.pulse = { car: 0, tractor: 0 };
    this.noise = 0;
    this.jetNoise = 0;
    this.carNoise = 0;
    this.seed = 47531;
    this.port.onmessage = ({ data }) => {
      if (data.kind in this.weights) this.vehicle = data.kind;
      if (Number.isFinite(data.rpm)) this.targetRpm = clamp(data.rpm, 0, 16000);
      if (Number.isFinite(data.load)) this.targetLoad = clamp(data.load, 0, 1);
    };
  }
  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 2147483648 - 1;
  }
  process(_inputs, outputs) {
    const channels = outputs[0];
    if (!channels || !channels.length) return true;
    const samples = channels[0];
    const sr = sampleRate;
    const rpmCoef = 1 - Math.exp(-1 / (sr * .085));
    const loadUp = 1 - Math.exp(-1 / (sr * .018));
    const loadDown = 1 - Math.exp(-1 / (sr * .105));
    const switchCoef = 1 - Math.exp(-1 / (sr * .11));
    for (let i = 0; i < samples.length; i++) {
      this.rpm += (this.targetRpm - this.rpm) * rpmCoef;
      this.load += (this.targetLoad - this.load) * (this.targetLoad > this.load ? loadUp : loadDown);
      let sum = 0;
      for (const kind of ['car', 'tractor', 'jet']) {
        const goal = kind === this.vehicle ? 1 : 0;
        this.weights[kind] += (goal - this.weights[kind]) * switchCoef;
        if (this.weights[kind] < .0002) continue;
        let signal = 0;
        if (kind === 'car') {
          const prev = this.phase.car;
          const phase = (prev + Math.max(700, this.rpm) / (120 * sr)) % 1;
          this.phase.car = phase;
          // Eight firing events per 720-degree four-stroke cycle. Alternating
          // exhaust banks give the engine a deliberately uneven pulse weight.
          const oldStep = Math.floor(prev * 8), newStep = Math.floor(phase * 8);
          if (newStep !== oldStep) this.pulse.car += (newStep % 4 === 1 ? .62 : 1) * (.5 + this.load * .8);
          this.pulse.car *= .995 - .0015 * this.load;
          const firing = Math.sin(TAU * phase * 8);
          const exhaust = Math.sin(TAU * phase * 16 + .18);
          const bank = Math.sin(TAU * phase * 24 + .45);
          const intake = Math.sin(TAU * phase * 32 + .34);
          const edge = Math.sin(TAU * phase * 48 + .12);
          const sub = Math.sin(TAU * phase * 4 + .3);
          const rough = Math.sin(TAU * phase * 2 + .9);
          const grit = this.random();
          this.carNoise += (grit - this.carNoise) * .07;
          signal = .13 * firing + .14 * exhaust + .085 * bank + .07 * intake + .04 * edge
            + .045 * sub + .015 * rough + .075 * (this.pulse.car - .38)
            + (.035 + .09 * this.load) * (grit - this.carNoise) * (.45 + this.pulse.car * .45);
          signal *= .62 + .62 * this.load;
        } else if (kind === 'tractor') {
          const prev = this.phase.tractor;
          const phase = (prev + Math.max(600, this.rpm) / (120 * sr)) % 1;
          this.phase.tractor = phase;
          // One combustion every 720 crankshaft degrees, with a short knock
          // and a slower exhaust resonance to preserve the single-cylinder beat.
          if (phase < prev) this.pulse.tractor = .9 + this.load * .55;
          this.pulse.tractor *= .996;
          const firing = Math.sin(TAU * phase + .15);
          const exhaust = Math.sin(TAU * phase * 2 - .25);
          const flywheel = Math.sin(TAU * phase * 4 + .55);
          const rattle = this.random();
          this.noise += (rattle - this.noise) * .11;
          signal = .16 * firing + .13 * exhaust + .055 * flywheel + .12 * (this.pulse.tractor - .1)
            + (.025 + .07 * this.load) * (rattle - this.noise) * (.25 + this.pulse.tractor);
          signal *= .58 + .58 * this.load;
        } else {
          const spin = clamp(this.rpm / 11000, .08, 1);
          this.phase.jet = (this.phase.jet + (115 + spin * 560) / sr) % 1;
          const white = this.random();
          this.jetNoise += (white - this.jetNoise) * (.025 + .12 * spin);
          const fan = Math.sin(TAU * this.phase.jet) + .3 * Math.sin(TAU * this.phase.jet * 2);
          signal = fan * (.12 + .10 * spin) + this.jetNoise * (.25 + .72 * this.load) + white * (.022 + .085 * this.load);
        }
        sum += this.weights[kind] * signal;
      }
      // Soft saturation controls the short combustion impulses without clipping.
      const out = Math.tanh(sum * .86) * .58;
      for (const channel of channels) channel[i] = out;
    }
    return true;
  }
}
registerProcessor('tinygrape-vehicle-sound', VehicleSound);
