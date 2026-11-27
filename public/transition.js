/*
 * CRT "channel switch" between screens:
 *  1. the current screen collapses into a bright horizontal line, like a tube switching off,
 *  2. a phosphor line flashes across the middle while the screens swap,
 *  3. the next screen expands back out of that line,
 *  4. the cartridge slots power on one by one in a stepped, low-frame-rate rhythm.
 * The background shader keeps running underneath; its glitch pulse is triggered by the caller.
 */

const COLLAPSE_MS = 240;
const EXPAND_MS = 420;
const FLASH_MS = 360;
const SLOT_BOOT_MS = 320;
const SLOT_BOOT_DELAY_MS = 180;
const SLOT_BOOT_STAGGER_MS = 90;

const COLLAPSE_KEYFRAMES = [
  { transform: "scale(1, 1)", filter: "brightness(1)", opacity: 1 },
  { transform: "scale(1.02, 0.012)", filter: "brightness(3)", opacity: 1, offset: 0.65 },
  { transform: "scale(0, 0.006)", filter: "brightness(5)", opacity: 0 },
];

const EXPAND_KEYFRAMES = [
  { transform: "scale(0.2, 0.006)", filter: "brightness(5)", opacity: 0 },
  { transform: "scale(1.02, 0.012)", filter: "brightness(3)", opacity: 1, offset: 0.35 },
  { transform: "scale(1, 1)", filter: "brightness(1)", opacity: 1 },
];

const FLASH_KEYFRAMES = [
  { opacity: 0, transform: "scaleX(0)" },
  { opacity: 1, transform: "scaleX(1)", offset: 0.45 },
  { opacity: 0, transform: "scaleX(0.3)" },
];

const SLOT_BOOT_KEYFRAMES = [
  { opacity: 0, transform: "translateY(12px)", filter: "brightness(2.5)" },
  { opacity: 1, transform: "translateY(0)", filter: "brightness(1)" },
];

/** Animations started here, so an interrupted switch can be fast-forwarded. */
const runningAnimations = new Set();

function track(animation) {
  runningAnimations.add(animation);
  animation.finished
    .catch(() => {})
    .finally(() => runningAnimations.delete(animation));
  return animation;
}

/** Jumps every running switch animation to its end state. */
export function finishRunningTransition() {
  runningAnimations.forEach((animation) => animation.finish());
}

/** The tube collapses toward the middle of what is currently on screen. */
function setOriginToViewportCenter(element) {
  const top = element.getBoundingClientRect().top;
  element.style.transformOrigin = `50% ${window.innerHeight / 2 - top}px`;
}

/** Powers on the cartridge slots of a screen one after another. */
export function bootSlots(view) {
  view.querySelectorAll(".r-slot").forEach((slot, index) => {
    track(slot.animate(SLOT_BOOT_KEYFRAMES, {
      duration: SLOT_BOOT_MS,
      delay: SLOT_BOOT_DELAY_MS + index * SLOT_BOOT_STAGGER_MS,
      easing: "steps(4, end)",
      fill: "backwards",
    }));
  });
}

/**
 * Plays the full switch.
 * @param {object} options
 * @param {HTMLElement} options.leaving   The screen currently shown.
 * @param {() => HTMLElement | null} options.swap  Hides the old screen, shows the new one and returns it;
 *   null means the switch was superseded and should stop here.
 * @param {HTMLElement | null} options.flash  The horizontal phosphor line element.
 * @returns {Promise<void>} Resolves when the new screen is fully expanded.
 */
export async function playChannelSwitch({ leaving, swap, flash }) {
  setOriginToViewportCenter(leaving);
  const collapse = track(leaving.animate(COLLAPSE_KEYFRAMES, {
    duration: COLLAPSE_MS,
    easing: "cubic-bezier(0.55, 0, 0.9, 0.4)",
  }));

  if (flash) {
    track(flash.animate(FLASH_KEYFRAMES, {
      duration: FLASH_MS,
      delay: COLLAPSE_MS * 0.6,
      easing: "ease-out",
    }));
  }

  await collapse.finished.catch(() => {});
  leaving.style.transformOrigin = "";

  const entering = swap();
  if (!entering) return;
  setOriginToViewportCenter(entering);
  const expand = track(entering.animate(EXPAND_KEYFRAMES, {
    duration: EXPAND_MS,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  }));
  bootSlots(entering);

  await expand.finished.catch(() => {});
  entering.style.transformOrigin = "";
}
