/*
 * Arcade Roster — the studio's work, shown as cartridges on the /roster screen.
 *
 * To add a title, append an entry to ROSTER. Slots are numbered in order,
 * and empty "NEW CHALLENGER" slots fill out the last row of the grid.
 */

/**
 * @typedef {object} RosterEntry
 * @property {string} id           Stable identifier, also used for the icon file name.
 * @property {string} name         Display name.
 * @property {string} alias        Romanized name, shown in the mono label style.
 * @property {string} kind         Short category tag, e.g. "APP" or "GAME".
 * @property {string} platforms    Platform tag, e.g. "iOS / ANDROID".
 * @property {string} status       Status chip text, e.g. "COMING SOON TO STORES".
 * @property {string} url          External link, opened in a new tab.
 * @property {string} icon         Square icon path (served from /public).
 * @property {{ ko: string, en: string }} description  One or two sentences, per language.
 */

/** @type {RosterEntry[]} */
export const ROSTER = [
  {
    id: "myungli-diary",
    name: "명리일기",
    alias: "MYUNGLI DIARY",
    kind: "APP",
    platforms: "iOS / ANDROID",
    status: "COMING SOON TO STORES",
    url: "https://myungli-diary.app",
    icon: "/works/myungli-diary.png",
    description: {
      ko: "같은 날이라도 각자의 오늘은 달라요. 내 사주로 매일의 일진을 풀어 드려요.",
      en: "The same day is different for everyone. See each day's reading for your chart.",
    },
  },
];

/** Desktop grid width; the mobile list shows a single empty slot (see styles.css). */
const SLOTS_PER_ROW = 3;

/* ------------------------------------------------------------------ DOM helpers */

/**
 * Creates an element with a class and children (strings become text nodes).
 * @param {string} tag
 * @param {string} className
 * @param {Array<Node | string>} [children]
 */
function createElement(tag, className, children = []) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.append(...children);
  return element;
}

function slotLabel(index) {
  return `SLOT ${String(index + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ cards */

/** Four pink corner marks: the "selected cartridge" frame from the design. */
function createCorners() {
  return ["tl", "tr", "bl", "br"].map((corner) => createElement("span", `r-card__corner r-card__corner--${corner}`));
}

/**
 * @param {RosterEntry} entry
 * @param {number} index
 * @param {"ko" | "en"} language
 */
function createCartridge(entry, index, language) {
  const icon = createElement("img", "r-card__icon");
  icon.src = entry.icon;
  icon.alt = "";
  icon.width = 64;
  icon.height = 64;
  icon.decoding = "async";

  const start = createElement("a", "r-card__start t-label-md", [
    createElement("span", "", ["PRESS START"]),
    createElement("span", "r-card__start-arrow", ["↗"]),
  ]);
  start.href = entry.url;
  start.target = "_blank";
  // noreferrer: services run as independent brands, so the visit does not carry luden.app as its origin.
  start.rel = "noopener noreferrer";
  start.setAttribute("aria-label", `${entry.name} — ${new URL(entry.url).host} (opens in a new tab)`);

  const card = createElement("li", "r-slot r-card", [
    ...createCorners(),
    createElement("div", "r-card__head", [
      createElement("span", "r-card__slot t-label-sm", [
        createElement("span", "r-card__cursor", ["▶"]),
        slotLabel(index),
      ]),
      createElement("span", "r-card__tags", [
        createElement("span", "r-tag r-tag--lime t-label-sm", [entry.kind]),
        createElement("span", "r-tag t-label-sm", [entry.platforms]),
      ]),
    ]),
    createElement("div", "r-card__identity", [
      icon,
      createElement("div", "r-card__titles", [
        createElement("span", "r-card__status t-label-sm", [entry.status]),
        createElement("h2", "r-card__name", [entry.name]),
        createElement("span", "r-card__alias t-label-sm", [entry.alias]),
      ]),
    ]),
    createElement("p", "r-card__description", [entry.description[language] ?? entry.description.en]),
    createElement("p", "r-card__domain t-label-sm", [
      createElement("span", "r-card__prompt", [">_"]),
      new URL(entry.url).host,
    ]),
    createElement("div", "r-card__foot", [
      createElement("span", "r-card__ready t-label-sm", [
        createElement("span", "r-card__ready-dot"),
        "CARTRIDGE OK",
      ]),
      start,
    ]),
  ]);
  card.dataset.rosterId = entry.id;
  return card;
}

/** A decorative placeholder for work that is not announced yet. */
function createEmptySlot(index) {
  const slot = createElement("li", "r-slot r-empty", [
    createElement("div", "r-card__head", [
      createElement("span", "r-card__slot t-label-sm", [`${slotLabel(index)} — EMPTY`]),
      createElement("span", "r-tag t-label-sm", ["STANDBY"]),
    ]),
    createElement("div", "r-empty__center", [
      createElement("span", "r-coin"),
      createElement("p", "r-empty__title t-label-md anim-pulse", ["NEW CHALLENGER APPROACHING..."]),
    ]),
    createElement("p", "r-empty__foot t-label-sm", ["INSERT COIN TO UNLOCK"]),
  ]);
  slot.setAttribute("aria-hidden", "true");
  return slot;
}

/* ------------------------------------------------------------------ render */

/**
 * Fills the roster list and the "NN LOADED" counter.
 * @param {HTMLElement} list
 * @param {RosterEntry[]} entries
 */
export function renderRoster(list, entries = ROSTER) {
  const language = document.documentElement.lang === "ko" ? "ko" : "en";
  const remainder = entries.length % SLOTS_PER_ROW;
  // Always leave at least one open slot: the roster is still growing.
  const emptyCount = remainder === 0 ? 1 : SLOTS_PER_ROW - remainder;

  const cartridges = entries.map((entry, index) => createCartridge(entry, index, language));
  const emptySlots = Array.from({ length: emptyCount }, (_, offset) => createEmptySlot(entries.length + offset));
  list.replaceChildren(...cartridges, ...emptySlots);

  document.querySelectorAll("[data-roster-count]").forEach((counter) => {
    counter.textContent = String(entries.length).padStart(2, "0");
  });
}
