/*
 * Luden splash — generative sound, built entirely with the Web Audio API (no audio files).
 *
 *  - Background: a soft pad (A) and an FM arpeggio (B) share one chord progression and clock.
 *  - Charge: while the pointer is held, a soft tone (C) rises one octave and the arpeggio ducks.
 *    Its pitch follows the same easing curve as the on-screen charge, so it falls back when released.
 *  - Screen switch: a short two-note coin chirp in the arpeggio's FM voice.
 *  - Off by default; browsers only allow audio after a user gesture, so the graph is built on first enable.
 *  - Suspended while the tab is hidden.
 */

/* ---------- Mix levels ---------- */
const MASTER_VOLUME = 0.3;
const PAD_LEVEL = 0.5;
const ARP_LEVEL = 0.3;
const ARP_DUCKED_LEVEL = 0.08;
const CHARGE_LEVEL = 0.12;
const SFX_LEVEL = 0.35;
const MASTER_FADE_SECONDS = 0.4;

/* ---------- Shared progression: both layers follow the same chord at the same time ---------- */
const PROGRESSION = [
  { pad: [48, 55, 59, 64], arp: [60, 64, 67, 71] }, // Cmaj7
  { pad: [45, 52, 55, 60], arp: [57, 60, 64, 67] }, // Am7
  { pad: [41, 48, 52, 57], arp: [53, 57, 60, 64] }, // Fmaj7
  { pad: [43, 50, 55, 59], arp: [55, 59, 62, 67] }, // G
];
const STEP_SECONDS = 0.125;
const STEPS_PER_CHORD = 32; // 4 seconds per chord
const ARP_PATTERN = [0, 1, 2, 3, 2, 1];
const SCHEDULE_AHEAD_SECONDS = 0.2;
const SCHEDULER_INTERVAL_MS = 50;

/* ---------- Screen-switch chirp: B5 then E6, a fourth up ---------- */
const CHIRP_NOTES = [83, 88];
const CHIRP_GAP_SECONDS = 0.07;

/* ---------- Charge tone ---------- */
const CHARGE_BASE_HZ = 130.81; // C3; a full charge reaches C4
const CHARGE_OCTAVE_CENTS = 1200;
const CHARGE_FILTER_LOW_HZ = 700;
const CHARGE_FILTER_HIGH_HZ = 1600;
const CHARGE_ATTACK_SECONDS = 0.35;
/** A first-order ease is within 1% of its target after about five time constants. */
const SETTLE_TIME_CONSTANTS = 5;

function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function rampTo(param, value, ctx, timeConstant) {
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, timeConstant);
}

function buildGraph() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.7;

  const padLfo = ctx.createOscillator();
  const padLfoDepth = ctx.createGain();
  padLfo.frequency.value = 0.08;
  padLfoDepth.gain.value = 400;
  padLfo.connect(padLfoDepth).connect(padFilter.frequency);
  padLfo.start();

  const padBus = ctx.createGain();
  const arpBus = ctx.createGain();
  const chargeBus = ctx.createGain();
  const sfxBus = ctx.createGain();
  padBus.gain.value = PAD_LEVEL;
  arpBus.gain.value = ARP_LEVEL;
  chargeBus.gain.value = CHARGE_LEVEL;
  sfxBus.gain.value = SFX_LEVEL;
  padFilter.connect(padBus).connect(master);
  arpBus.connect(master);
  chargeBus.connect(master);
  sfxBus.connect(master);

  return { ctx, master, padFilter, arpBus, chargeBus, sfxBus };
}

function playPadChord(graph, notes, startTime) {
  const { ctx, padFilter } = graph;
  const chordSeconds = STEPS_PER_CHORD * STEP_SECONDS;
  notes.forEach((note) => {
    [-6, 6].forEach((detuneCents) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = midiToFrequency(note);
      osc.detune.value = detuneCents;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.setTargetAtTime(0.06, startTime, 0.8);
      gain.gain.setTargetAtTime(0, startTime + chordSeconds, 0.8);
      osc.connect(gain).connect(padFilter);
      osc.start(startTime);
      osc.stop(startTime + chordSeconds + 4);
    });
  });
}

/** Two-operator FM note: a 2:1 modulator gives the bright bell-like tone. */
function playFmNote(graph, frequency, startTime, destination = graph.arpBus) {
  const { ctx } = graph;
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modulationDepth = ctx.createGain();
  const envelope = ctx.createGain();

  carrier.frequency.value = frequency;
  modulator.frequency.value = frequency * 2;
  modulationDepth.gain.setValueAtTime(frequency * 3, startTime);
  modulationDepth.gain.exponentialRampToValueAtTime(frequency * 0.3, startTime + 0.15);

  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(0.25, startTime + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

  modulator.connect(modulationDepth).connect(carrier.frequency);
  carrier.connect(envelope).connect(destination);
  modulator.start(startTime);
  carrier.start(startTime);
  modulator.stop(startTime + 0.25);
  carrier.stop(startTime + 0.25);
}

/**
 * Starts the charge tone. Pitch is expressed as detune (cents) so it eases linearly in musical pitch,
 * exactly like the on-screen charge amount (0..1) maps to 0..1 octave.
 */
function startChargeVoice(graph, chargeTimeConstant) {
  const { ctx, chargeBus } = graph;
  const now = ctx.currentTime;

  const main = ctx.createOscillator();
  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();
  const vibrato = ctx.createOscillator();
  const vibratoDepth = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const envelope = ctx.createGain();

  main.type = "sine";
  shimmer.type = "triangle";
  shimmerGain.gain.value = 0.25;
  main.frequency.value = CHARGE_BASE_HZ;
  shimmer.frequency.value = CHARGE_BASE_HZ * 2;
  const pitchParams = [main.detune, shimmer.detune];
  pitchParams.forEach((param) => {
    param.setValueAtTime(0, now);
    param.setTargetAtTime(CHARGE_OCTAVE_CENTS, now, chargeTimeConstant);
  });

  vibrato.frequency.value = 5;
  vibratoDepth.gain.value = 4; // cents
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(main.detune);
  vibratoDepth.connect(shimmer.detune);

  filter.type = "lowpass";
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(CHARGE_FILTER_LOW_HZ, now);
  filter.frequency.setTargetAtTime(CHARGE_FILTER_HIGH_HZ, now, chargeTimeConstant);

  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(1, now + CHARGE_ATTACK_SECONDS);

  main.connect(filter);
  shimmer.connect(shimmerGain).connect(filter);
  filter.connect(envelope).connect(chargeBus);
  const oscillators = [main, shimmer, vibrato];
  oscillators.forEach((osc) => osc.start(now));

  /** Falls back down with the on-screen discharge curve and fades out alongside it. */
  return function releaseChargeVoice(releaseTimeConstant) {
    const releaseStart = ctx.currentTime;
    [...pitchParams, filter.frequency, envelope.gain].forEach((param) => {
      param.cancelScheduledValues(releaseStart);
      param.setValueAtTime(param.value, releaseStart);
    });
    pitchParams.forEach((param) => param.setTargetAtTime(0, releaseStart, releaseTimeConstant));
    filter.frequency.setTargetAtTime(CHARGE_FILTER_LOW_HZ, releaseStart, releaseTimeConstant);
    envelope.gain.setTargetAtTime(0, releaseStart, releaseTimeConstant);
    const stopTime = releaseStart + releaseTimeConstant * SETTLE_TIME_CONSTANTS;
    oscillators.forEach((osc) => osc.stop(stopTime));
  };
}

/**
 * @param {object} timing
 * @param {number} timing.chargeTimeConstant  Seconds; how fast the on-screen charge rises.
 * @param {() => number} timing.getReleaseTimeConstant  Seconds; how fast it falls (depends on layout).
 */
export function createSoundEngine({ chargeTimeConstant, getReleaseTimeConstant }) {
  let graph = null;
  let isEnabled = false;
  let transportTimer = null;
  let releaseCharge = null;

  function startTransport() {
    if (transportTimer) return;
    let step = 0;
    let nextStepTime = graph.ctx.currentTime + 0.05;

    function schedule() {
      while (nextStepTime < graph.ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
        const chord = PROGRESSION[Math.floor(step / STEPS_PER_CHORD) % PROGRESSION.length];
        if (step % STEPS_PER_CHORD === 0) playPadChord(graph, chord.pad, nextStepTime);
        playFmNote(graph, midiToFrequency(chord.arp[ARP_PATTERN[step % ARP_PATTERN.length]]), nextStepTime);
        if (step % 4 === 0) playFmNote(graph, midiToFrequency(chord.arp[0] - 24), nextStepTime);
        nextStepTime += STEP_SECONDS;
        step += 1;
      }
    }

    schedule();
    transportTimer = setInterval(schedule, SCHEDULER_INTERVAL_MS);
  }

  function stopTransport() {
    clearInterval(transportTimer);
    transportTimer = null;
  }

  function setCharging(charging) {
    if (charging && isEnabled && !releaseCharge) {
      releaseCharge = startChargeVoice(graph, chargeTimeConstant);
      // Duck the arpeggio quickly so the charge tone sits on top.
      rampTo(graph.arpBus.gain, ARP_DUCKED_LEVEL, graph.ctx, 0.15);
    } else if (!charging && releaseCharge) {
      releaseCharge(getReleaseTimeConstant());
      releaseCharge = null;
      rampTo(graph.arpBus.gain, ARP_LEVEL, graph.ctx, 0.6);
    }
  }

  /** Plays the coin chirp on its own bus, so a ducked arpeggio does not quiet it. */
  function playChirp() {
    if (!isEnabled || !graph) return;
    const startTime = graph.ctx.currentTime + 0.01;
    CHIRP_NOTES.forEach((note, index) => {
      playFmNote(graph, midiToFrequency(note), startTime + index * CHIRP_GAP_SECONDS, graph.sfxBus);
    });
  }

  function setEnabled(enabled) {
    if (enabled === isEnabled) return;
    isEnabled = enabled;

    if (enabled) {
      graph ??= buildGraph();
      graph.ctx.resume();
      rampTo(graph.master.gain, MASTER_VOLUME, graph.ctx, MASTER_FADE_SECONDS / 3);
      startTransport();
      return;
    }

    setCharging(false);
    rampTo(graph.master.gain, 0, graph.ctx, MASTER_FADE_SECONDS / 3);
    setTimeout(() => {
      if (isEnabled) return;
      stopTransport();
      graph.ctx.suspend();
    }, MASTER_FADE_SECONDS * 1000 * 2);
  }

  document.addEventListener("visibilitychange", () => {
    if (!graph || !isEnabled) return;
    if (document.hidden) {
      setCharging(false);
      graph.ctx.suspend();
    } else {
      graph.ctx.resume();
    }
  });

  return {
    get isEnabled() {
      return isEnabled;
    },
    setEnabled,
    setCharging,
    playChirp,
  };
}
