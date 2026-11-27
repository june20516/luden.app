/*
 * Screen router. The screens are listed once, in <script id="routes"> in index.html.
 *
 * Cloudflare serves index.html for paths without a file (not_found_handling: single-page-application),
 * so every path loads this page. An inline script in <head> shows the matching [data-view] before the
 * first paint; this module then keeps the screen, the URL, the title and the canonical link in sync.
 * A path that is not a screen is rewritten to "/" (home).
 */

import { bootSlots, finishRunningTransition, playChannelSwitch } from "./transition.js";

/** @typedef {{ path: string, title: string }} Route */

const HOME = "home";

/** @type {Record<string, Route>} */
const ROUTES = JSON.parse(document.getElementById("routes")?.textContent ?? "{}");

/** @returns {string | null} The route key, or null for a path that is not a screen of this page. */
function routeFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = Object.entries(ROUTES).find(([, route]) => route.path === normalized);
  return match ? match[0] : null;
}

function viewFor(route) {
  return document.querySelector(`[data-view="${route}"]`);
}

function isVisible(element) {
  return element.getClientRects().length > 0;
}

/** After a switch, focus goes to the screen's visible [data-route-focus] element. */
function focusAfterSwitch(route) {
  const target = [...(viewFor(route)?.querySelectorAll("[data-route-focus]") ?? [])].find(isVisible);
  target?.focus({ preventScroll: true });
}

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * @param {object} options
 * @param {MediaQueryList} options.reducedMotionQuery
 * @param {() => void} [options.onSwitchStart]  Called as a switch begins (shader glitch, sound).
 */
export function startRouter({ reducedMotionQuery, onSwitchStart }) {
  const routeStyle = document.getElementById("route-style");
  const canonical = document.querySelector('link[rel="canonical"]');
  const canonicalOrigin = canonical ? new URL(canonical.href).origin : location.origin;
  const flash = document.querySelector(".crt-flash");
  let currentRoute = routeFromPath(location.pathname) ?? HOME;
  /** Increments per switch, so a superseded switch knows to stop. */
  let switchId = 0;
  let isSwitching = false;

  function applyRoute(route) {
    if (routeStyle) routeStyle.textContent = `[data-view]:not([data-view="${route}"]) { display: none; }`;
    document.title = ROUTES[route].title;
    canonical?.setAttribute("href", canonicalOrigin + ROUTES[route].path);
  }

  async function showRoute(route) {
    if (route === currentRoute) return;
    const id = ++switchId;
    const leaving = viewFor(currentRoute);
    currentRoute = route;

    const swap = () => {
      applyRoute(route);
      window.scrollTo(0, 0);
      return viewFor(route);
    };

    // Reduced motion, or a second switch while one is still animating: change screens at once.
    if (reducedMotionQuery.matches || isSwitching || !leaving) {
      finishRunningTransition();
      swap();
      isSwitching = false;
      focusAfterSwitch(route);
      return;
    }

    isSwitching = true;
    onSwitchStart?.();
    await playChannelSwitch({ leaving, flash, swap: () => (id === switchId ? swap() : null) });
    if (id !== switchId) return;
    isSwitching = false;
    focusAfterSwitch(route);
  }

  /** Goes to a route; returning to the screen we came from rewinds history instead of stacking entries. */
  function navigate(route) {
    if (route === currentRoute) return;
    if (history.state?.cameFrom === route) {
      history.back();
      return;
    }
    history.pushState({ route, cameFrom: currentRoute }, "", ROUTES[route].path);
    showRoute(route);
  }

  // Canonical URL: "/roster/" → "/roster", and a path that is not a screen → "/".
  history.replaceState(
    { ...history.state, route: currentRoute },
    "",
    ROUTES[currentRoute].path + location.search + location.hash,
  );
  applyRoute(currentRoute);
  if (!reducedMotionQuery.matches) bootSlots(viewFor(currentRoute));

  window.addEventListener("popstate", () => showRoute(routeFromPath(location.pathname) ?? HOME));

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !isPlainLeftClick(event)) return;
    const link = event.target.closest("a[data-route-link]");
    if (!link) return;
    const route = routeFromPath(new URL(link.href).pathname);
    if (!route) return;
    event.preventDefault();
    navigate(route);
  });

  document.addEventListener("keydown", (event) => {
    if (currentRoute === HOME || event.defaultPrevented) return;

    if (event.key === "Escape") {
      event.preventDefault();
      navigate(HOME);
      return;
    }

    // Arcade-style cursor: arrow keys move between the cartridges of the current screen.
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const cartridges = [...(viewFor(currentRoute)?.querySelectorAll(".r-card__start") ?? [])];
    if (cartridges.length === 0) return;
    event.preventDefault();
    const index = cartridges.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = index === -1 ? 0 : (index + step + cartridges.length) % cartridges.length;
    cartridges[next].focus();
  });

  return { navigate };
}
