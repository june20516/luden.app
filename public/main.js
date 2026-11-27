/*
 * Luden splash — interactive CRT shader + phosphor particles.
 * Ported from the Stitch designs (desktop & mobile variants share one shader).
 *
 * Adaptations on top of the original:
 *  - Frame-rate independent easing (same feel on 60/120 Hz displays).
 *  - prefers-reduced-motion: time is frozen, flicker and particles are off, frames render only on interaction.
 *  - Low-end devices: lower starting render scale and automatic downscaling when FPS drops.
 *  - Scanline density is defined in CSS pixels so it stays identical at any render scale.
 *  - No WebGL / lost context: falls back to a static CSS background.
 *  - Screen switches (see router.js) pulse a "channel change" glitch: torn scanlines, a rolling band and static.
 */

import { createSoundEngine } from "./sound.js";
import { renderRoster } from "./roster.js";
import { startRouter } from "./router.js";

const MOBILE_QUERY = window.matchMedia("(max-width: 767px)");
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Per-frame lerp rates from the design (tuned for 60 fps). */
const CHARGE_RATE = 0.024;
const RELEASE_RATE = { desktop: 0.038, mobile: 0.045 };
const POINTER_FOLLOW_RATE = { desktop: 0.12, mobile: 1 };

/** Scanline phase per CSS pixel: the design's 0.75 rad per device pixel at DPR 2. */
const SCANLINE_RADIANS_PER_CSS_PX = 1.5;

/** Time used for the still frame when motion is reduced. */
const FROZEN_TIME_SECONDS = 2.4;

/** Channel-switch glitch: rises to full strength at GLITCH_PEAK, then fades out by the end. */
const GLITCH_DURATION_MS = 900;
const GLITCH_PEAK = 0.3;

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;       // normalized, origin bottom-left
uniform float u_press;        // 0..1 charge amount
uniform float u_scanDensity;  // scanline radians per canvas pixel
uniform float u_flicker;      // 0 = off, 1 = on
uniform float u_variant;      // 0 = desktop composition, 1 = mobile composition
uniform float u_glitch;       // 0..1 channel-switch glitch strength

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 aspectUv = vec2(uv.x * aspect, uv.y);
  vec2 pointer = vec2(u_pointer.x * aspect, u_pointer.y);
  float dist = length(aspectUv - pointer);

  // CRT curvature distortion
  vec2 cc = uv - 0.5;
  vec2 crtUv = uv + cc * (dot(cc, cc) * 0.12);

  // Channel switch: some scanline rows tear sideways, re-rolled 24 times a second
  float row = floor(uv.y * 120.0);
  float rowNoise = hash(vec2(row, floor(u_time * 24.0)));
  crtUv.x += (rowNoise - 0.5) * 0.12 * u_glitch * step(0.6, rowNoise);

  vec3 crtDark = vec3(0.06, 0.05, 0.10);
  vec3 arcadePink = vec3(1.0, 0.16, 0.43);
  vec3 secondaryCyan = vec3(0.02, 0.85, 0.91);

  // Horizontal scanlines
  float scanline = sin(crtUv.y * u_resolution.y * u_scanDensity + u_time * 5.0) * 0.5 + 0.5;
  float scanMask = mix(0.72, 1.0, scanline);

  // Retro perspective floor grid
  vec3 col = crtDark;
  if (crtUv.y < 0.45) {
    float depth = 1.0 / (0.46 - crtUv.y);
    float gridX = fract(crtUv.x * depth * 0.8 + u_time * 0.4);
    float gridY = fract(depth * 0.3 - u_time * 1.2);
    float gridLine = (step(0.92, gridX) + step(0.92, gridY)) * (1.0 - smoothstep(0.0, 0.45, crtUv.y));
    vec3 gridCol = mix(arcadePink, secondaryCyan, clamp(crtUv.x + u_press * 0.5, 0.0, 1.0));
    col += gridCol * gridLine * (0.55 + u_press * 0.25);
  }

  // Charge: accelerating ripple that crossfades into a linear gradient orb
  float progress = clamp(u_press, 0.0, 1.0);
  vec3 glowColor = mix(arcadePink, secondaryCyan, progress);
  float waveSpeed = mix(2.2, 9.5, progress);
  float waveFreq = mix(22.0, 38.0, progress);
  float wave = sin(dist * waveFreq - u_time * waveSpeed) * 0.5 + 0.5;
  float mouseGlow = 1.0 - smoothstep(0.0, 0.65, dist);
  float orb = clamp(1.0 - (dist / 0.55), 0.0, 1.0);
  float blendToOrb = pow(progress, 1.4);

  if (u_variant < 0.5) {
    float shape = mix(mouseGlow * wave, orb * 0.85, blendToOrb);
    col += shape * (0.35 + progress * 0.45) * glowColor;
    col *= scanMask;
  } else {
    float shape = mix(mouseGlow * (0.28 + progress * 0.35) * wave, orb * 0.85, blendToOrb);
    col *= scanMask;
    col += shape * glowColor;
  }

  // Channel switch: a bright band rolling down the tube plus static snow
  float band = 1.0 - smoothstep(0.0, 0.08, abs(fract(uv.y + u_time * 1.7) - 0.5));
  float snow = hash(floor(gl_FragCoord.xy / 2.0) + fract(u_time) * 97.0);
  col += (band * 0.35 + snow * 0.2) * u_glitch * vec3(0.85, 0.9, 1.0);

  // CRT tube border darkness
  float vignette = (1.0 - smoothstep(0.46, 0.5, abs(uv.x - 0.5))) * (1.0 - smoothstep(0.46, 0.5, abs(uv.y - 0.5)));
  col *= vignette;

  // Subtle phosphor flicker
  col *= mix(1.0, 0.96 + 0.04 * sin(u_time * 60.0), u_flicker);

  gl_FragColor = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------ helpers */

function currentVariant() {
  return MOBILE_QUERY.matches ? "mobile" : "desktop";
}

/** Converts a per-frame (60 fps) lerp rate into one for an arbitrary frame delta. */
function frameIndependentRate(ratePerFrame, deltaSeconds) {
  if (ratePerFrame >= 1) return 1;
  return 1 - Math.pow(1 - ratePerFrame, deltaSeconds * 60);
}

/** The same easing as a continuous time constant (seconds), for Web Audio's setTargetAtTime. */
function rateToTimeConstant(ratePerFrame) {
  return -1 / (60 * Math.log(1 - ratePerFrame));
}

/**
 * Seconds between two frame timestamps, clamped to [0, 0.1].
 * rAF timestamps can precede a performance.now() taken earlier in the same frame,
 * and a long pause (hidden tab) must not make the easing jump.
 */
function clampedDeltaSeconds(now, previous) {
  return Math.min(Math.max((now - previous) / 1000, 0), 0.1);
}

function isLowEndDevice() {
  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const saveData = navigator.connection?.saveData === true;
  return memory <= 4 || cores <= 4 || saveData;
}

/* ------------------------------------------------------------------ shared input state */

const input = {
  /** Target pointer position, normalized with origin at bottom-left. */
  target: { x: 0.5, y: 0.5 },
  isPressed: false,
  listeners: new Set(),

  setFromClient(clientX, clientY) {
    this.target.x = clientX / window.innerWidth;
    this.target.y = 1 - clientY / window.innerHeight;
    this.notify();
  },

  setPressed(pressed) {
    this.isPressed = pressed;
    this.notify();
  },

  notify() {
    this.listeners.forEach((listener) => listener());
  },
};

function bindInput() {
  window.addEventListener("mousemove", (event) => input.setFromClient(event.clientX, event.clientY));
  window.addEventListener("mousedown", (event) => {
    input.setFromClient(event.clientX, event.clientY);
    input.setPressed(true);
  });
  window.addEventListener("mouseup", () => input.setPressed(false));

  const handleTouch = (event) => {
    const touch = event.touches?.[0];
    if (touch) input.setFromClient(touch.clientX, touch.clientY);
  };
  window.addEventListener("touchstart", (event) => {
    handleTouch(event);
    input.setPressed(true);
  }, { passive: true });
  window.addEventListener("touchmove", handleTouch, { passive: true });
  window.addEventListener("touchend", () => input.setPressed(false));
  window.addEventListener("touchcancel", () => input.setPressed(false));
  window.addEventListener("blur", () => input.setPressed(false));

  preventTouchContextMenu();
}

/** External links and the contact address keep their native long-press behavior; PRESS START stays "hold to charge". */
const NATIVE_CONTEXT_MENU_SELECTOR = "a:not([data-route-link]), .d-contact__address, .m-contact__address";

/**
 * A long press is "hold to charge", so it must not open a context menu or interrupt the touch.
 * Only touch-initiated menus are blocked; a mouse right-click on desktop is left alone.
 */
function preventTouchContextMenu() {
  let activeTouches = 0;
  const updateTouches = (event) => { activeTouches = event.touches.length; };
  window.addEventListener("touchstart", updateTouches, { passive: true });
  window.addEventListener("touchend", updateTouches);
  window.addEventListener("touchcancel", updateTouches);

  window.addEventListener("contextmenu", (event) => {
    const isTouch = activeTouches > 0 || event.pointerType === "touch";
    if (!isTouch) return;
    if (event.target instanceof Element && event.target.closest(NATIVE_CONTEXT_MENU_SELECTOR)) return;
    event.preventDefault();
  });
}

/* ------------------------------------------------------------------ FPS readout */

function createFpsMeter() {
  const elements = document.querySelectorAll("[data-fps]");
  let frames = 0;
  let windowStart = performance.now();

  return {
    /** Counts a frame; returns the measured FPS when a 500 ms window closes, otherwise null. */
    tick(now) {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed < 500) return null;

      const fps = (frames * 1000) / elapsed;
      elements.forEach((element) => {
        element.textContent = element.dataset.fpsFormat === "mobile"
          ? fps.toFixed(1)
          : `${Math.round(fps)} FPS`;
      });
      frames = 0;
      windowStart = now;
      return fps;
    },

    reset(now) {
      frames = 0;
      windowStart = now;
    },
  };
}

/* ------------------------------------------------------------------ render-scale governor */

/**
 * Picks the canvas pixel ratio. Starts lower on weak hardware and steps down
 * (never back up, to avoid oscillation) while measured FPS stays below target.
 */
function createQualityGovernor() {
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const steps = [...new Set([devicePixelRatio, 1.5, 1, 0.75])]
    .filter((scale) => scale <= devicePixelRatio)
    .sort((a, b) => b - a);

  let index = isLowEndDevice() ? Math.max(steps.indexOf(1), 0) : 0;
  let slowWindows = 0;
  let warmupWindows = 2;

  return {
    get scale() {
      return steps[index];
    },

    /** Feeds one FPS sample; returns true when the scale changed. */
    report(fps) {
      if (warmupWindows > 0) {
        warmupWindows -= 1;
        return false;
      }
      slowWindows = fps < 45 ? slowWindows + 1 : 0;
      if (slowWindows < 3 || index >= steps.length - 1) return false;

      index += 1;
      slowWindows = 0;
      warmupWindows = 1;
      return true;
    },

    pause() {
      slowWindows = 0;
      warmupWindows = 2;
    },
  };
}

/* ------------------------------------------------------------------ CRT shader */

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[luden] shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[luden] program link failed:", gl.getProgramInfoLog(program));
    return null;
  }

  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniformNames = ["u_time", "u_resolution", "u_pointer", "u_press", "u_scanDensity", "u_flicker", "u_variant", "u_glitch"];
  const uniforms = Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]));
  return { uniforms };
}

/** Glitch envelope for a pulse started at startTime: linear rise, then an eased fade. */
function glitchAmount(now, startTime) {
  const progress = (now - startTime) / GLITCH_DURATION_MS;
  if (progress < 0 || progress >= 1) return 0;
  if (progress < GLITCH_PEAK) return progress / GLITCH_PEAK;
  const fade = 1 - (progress - GLITCH_PEAK) / (1 - GLITCH_PEAK);
  return fade * fade;
}

/** @returns {{ pulseGlitch: () => void } | null} null when WebGL is unavailable. */
function startCrtShader(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" })
    || canvas.getContext("experimental-webgl");
  if (!gl) return null;

  let program = createProgram(gl);
  if (!program) return null;

  const fpsMeter = createFpsMeter();
  const governor = createQualityGovernor();
  const startTime = performance.now();
  const pointer = { x: 0.5, y: 0.5 };
  let pressAmount = 0;
  let lastFrameTime = startTime;
  let frameRequest = 0;
  let contextLost = false;
  let glitchStartTime = -Infinity;

  function resizeCanvas() {
    const scale = governor.scale;
    const width = Math.max(1, Math.floor(window.innerWidth * scale));
    const height = Math.max(1, Math.floor(window.innerHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    return scale;
  }

  /** In reduced-motion mode the loop sleeps once the charge and pointer have settled. */
  function isSettled() {
    const targetPress = input.isPressed ? 1 : 0;
    return Math.abs(pressAmount - targetPress) < 0.002
      && Math.abs(pointer.x - input.target.x) < 0.0005
      && Math.abs(pointer.y - input.target.y) < 0.0005;
  }

  function draw(now) {
    const variant = currentVariant();
    const reducedMotion = REDUCED_MOTION_QUERY.matches;
    const deltaSeconds = clampedDeltaSeconds(now, lastFrameTime);
    lastFrameTime = now;

    const follow = frameIndependentRate(POINTER_FOLLOW_RATE[variant], deltaSeconds);
    pointer.x += (input.target.x - pointer.x) * follow;
    pointer.y += (input.target.y - pointer.y) * follow;

    const targetPress = input.isPressed ? 1 : 0;
    const pressRate = input.isPressed ? CHARGE_RATE : RELEASE_RATE[variant];
    pressAmount += (targetPress - pressAmount) * frameIndependentRate(pressRate, deltaSeconds);

    const scale = resizeCanvas();
    const time = reducedMotion ? FROZEN_TIME_SECONDS : (now - startTime) / 1000;
    const { uniforms } = program;
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
    gl.uniform1f(uniforms.u_press, pressAmount);
    gl.uniform1f(uniforms.u_scanDensity, SCANLINE_RADIANS_PER_CSS_PX / scale);
    gl.uniform1f(uniforms.u_flicker, reducedMotion ? 0 : 1);
    gl.uniform1f(uniforms.u_variant, variant === "mobile" ? 1 : 0);
    gl.uniform1f(uniforms.u_glitch, reducedMotion ? 0 : glitchAmount(now, glitchStartTime));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const fps = fpsMeter.tick(now);
    if (fps !== null && !reducedMotion) governor.report(fps);
  }

  function loop(now) {
    frameRequest = 0;
    if (contextLost) return;
    draw(now);
    if (!REDUCED_MOTION_QUERY.matches || !isSettled()) requestFrame();
  }

  function requestFrame() {
    if (frameRequest || contextLost) return;
    frameRequest = requestAnimationFrame(loop);
  }

  function wake() {
    const now = performance.now();
    lastFrameTime = now;
    fpsMeter.reset(now);
    requestFrame();
  }

  input.listeners.add(requestFrame);
  window.addEventListener("resize", requestFrame);
  MOBILE_QUERY.addEventListener("change", requestFrame);
  REDUCED_MOTION_QUERY.addEventListener("change", wake);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      governor.pause();
    } else {
      wake();
    }
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    document.documentElement.classList.add("no-webgl");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    program = createProgram(gl);
    if (!program) return;
    contextLost = false;
    document.documentElement.classList.remove("no-webgl");
    wake();
  });

  wake();
  return {
    pulseGlitch() {
      glitchStartTime = performance.now();
      requestFrame();
    },
  };
}

/* ------------------------------------------------------------------ phosphor particles (desktop) */

const PARTICLE_COLORS = ["#ffb0c9", "#cabeff", "#05d9e8", "#ffffff"];
const MAX_PARTICLES = 400;

function startPhosphorParticles(canvas, startButton) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const particles = [];
  let frameRequest = 0;
  let lastFrameTime = 0;

  const isEnabled = () => !MOBILE_QUERY.matches && !REDUCED_MOTION_QUERY.matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawn(x, y, count) {
    if (!isEnabled()) return;
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i += 1) {
      particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        size: Math.random() * 3 + 1,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        life: 1,
      });
    }
    if (!frameRequest) {
      lastFrameTime = performance.now();
      frameRequest = requestAnimationFrame(animate);
    }
  }

  function animate(now) {
    const steps = clampedDeltaSeconds(now, lastFrameTime) * 60;
    lastFrameTime = now;
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.x += particle.vx * steps;
      particle.y += particle.vy * steps;
      particle.life -= 0.025 * steps;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      context.fillStyle = particle.color;
      context.globalAlpha = particle.life;
      context.shadowBlur = 8;
      context.shadowColor = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;

    frameRequest = particles.length > 0 ? requestAnimationFrame(animate) : 0;
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (event) => spawn(event.clientX, event.clientY, 2));
  window.addEventListener("pointerdown", (event) => spawn(event.clientX, event.clientY, 16));

  startButton?.addEventListener("click", () => {
    startButton.classList.add("is-pressed");
    setTimeout(() => startButton.classList.remove("is-pressed"), 120);
    spawn(window.innerWidth / 2, window.innerHeight / 2, 40);
  });
}

/* ------------------------------------------------------------------ sound */

/**
 * Sound toggles (every screen and layout) share one engine; holding the pointer plays the charge tone.
 * @returns {ReturnType<typeof createSoundEngine> | null}
 */
function bindSound() {
  const toggles = document.querySelectorAll("[data-sound-toggle]");
  if (toggles.length === 0 || !("AudioContext" in window)) return null;

  const sound = createSoundEngine({
    chargeTimeConstant: rateToTimeConstant(CHARGE_RATE),
    getReleaseTimeConstant: () => rateToTimeConstant(RELEASE_RATE[currentVariant()]),
  });

  function render() {
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-pressed", String(sound.isEnabled));
      toggle.querySelector("[data-sound-state]").textContent = sound.isEnabled ? "ON" : "OFF";
    });
    document.documentElement.classList.toggle("is-sound-on", sound.isEnabled);
  }

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      sound.setEnabled(!sound.isEnabled);
      render();
    });
  });

  input.listeners.add(() => sound.setCharging(input.isPressed));
  render();
  return sound;
}

/* ------------------------------------------------------------------ boot */

bindInput();

const rosterList = document.querySelector("[data-roster-list]");
if (rosterList) renderRoster(rosterList);

const crtCanvas = document.getElementById("crt-canvas");
const crtShader = crtCanvas ? startCrtShader(crtCanvas) : null;
if (!crtShader) {
  document.documentElement.classList.add("no-webgl");
}

const phosphorCanvas = document.getElementById("phosphor-canvas");
if (phosphorCanvas) {
  startPhosphorParticles(phosphorCanvas, document.getElementById("press-start-btn"));
}

const sound = bindSound();

startRouter({
  reducedMotionQuery: REDUCED_MOTION_QUERY,
  onSwitchStart() {
    crtShader?.pulseGlitch();
    sound?.playChirp();
  },
});
