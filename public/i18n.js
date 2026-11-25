/*
 * Picks the page language from the browser locale: Korean for "ko*", English otherwise.
 * Loaded synchronously at the end of <body> so the swap happens before the first paint.
 * Elements marked with data-i18n="<key>" receive the matching lines, joined with <br>.
 */

const TRANSLATIONS = {
  en: {
    manifesto: [
      "We chase new experiments over set formulas.",
      "We transmute the fun we dreamed of and the ideas we held onto into something real.",
      "May there be joy in everyone's life.",
    ],
  },
  ko: {
    manifesto: [
      "정해진 공식보다 새로운 시도를 추구합니다.",
      "꿈꾸던 재미, 간직했던 생각을 현실에 연성합니다.",
      "모두의 삶에 즐거움이 있기를.",
    ],
  },
};

function detectLanguage() {
  const browserLanguage = (navigator.language || "en").toLowerCase();
  return browserLanguage.startsWith("ko") ? "ko" : "en";
}

function renderLines(element, lines) {
  element.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) element.append(document.createElement("br"));
    element.append(line);
  });
}

function applyTranslations(language) {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const lines = TRANSLATIONS[language][element.dataset.i18n];
    if (lines) renderLines(element, lines);
  });
}

applyTranslations(detectLanguage());
