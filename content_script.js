"use strict";
export const privacyScanner = (() => {
  const CATEGORIES = {
    Health: [
      "accelerometers",
      "active minutes",
      "activity tracking",
      "Apple HealthKit",
      "barometer",
      "calories",
      "device sensor data",
      "fitness",
      "food",
      "Google Fit",
      "gyroscopes",
      "health",
      "heart rate",
      "magnetometer",
      "motion",
      "pedometer",
      "sleep",
      "steps",
      "walk",
      "water",
      "weight",
    ],
    Purchases: ["purchases", "shopping", "spending"],
    Financial: [
      "assets",
      "bank account",
      "card number",
      "credit score",
      "debts",
      "income",
      "payment",
      "payment service",
      "salary",
    ],
    Location: [
      "approximate",
      "bluetooth",
      "coarse",
      "GPS",
      "IP address",
      "location",
      "precise",
      "ultra wideband",
    ],
    "Contact Info": ["name", "address", "email", "phone number", "text"],
    "User Content": [
      "audio",
      "capture",
      "chat",
      "customer support",
      "direct message",
      "email",
      "gameplay",
      "photos",
      "recordings",
      "text",
      "user content",
      "videos",
      "voice",
    ],
    Search: ["search", "history"],
    Browsing: [
      "cookies",
      "browsing history",
      "third party tracking",
      "trackers",
    ],
    Identifiers: [
      "account ID",
      "advertising ID",
      "customer number",
      "device ID",
      "handle",
      "IMEI",
      "MAC address",
      "screen name",
      "serial number",
      "user name",
      "UUID",
    ],
    "Usage Data": [
      "advertising",
      "analytics",
      "clicked",
      "engagement",
      "interact",
      "likes",
      "usage data",
      "user interaction",
      "viewed",
      "views",
    ],
    "Sensitive Info": [
      "belief",
      "biometric",
      "childbirth",
      "disability",
      "ethnic",
      "genetic",
      "philosophical",
      "political",
      "pregnancy",
      "racial",
      "religious",
      "sensitive information",
      "sexual orientation",
      "union",
    ],
    Diagnostics: ["crash logs", "diagnostics", "energy use", "launch time"],
    "Other Data": ["other data", "LiDAR", "lidar"],
  };

  let userAdded = {};
  let TERM_TO_CATEGORY = {};
  let termsRegex = null;
  const DEFAULT_MAX_TEXT = 500_000;

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rebuildIndex() {
    TERM_TO_CATEGORY = {};
    const all = {};

    Object.entries(CATEGORIES).forEach(
      ([cat, arr]) => (all[cat] = arr.slice())
    );

    Object.entries(userAdded).forEach(([cat, arr]) => {
      if (!all[cat]) all[cat] = [];
      arr.forEach((t) => {
        if (t && !all[cat].includes(t)) all[cat].push(t);
      });
    });

    Object.entries(all).forEach(([cat, terms]) => {
      terms.forEach((t) => {
        const key = t.toLowerCase();
        if (!TERM_TO_CATEGORY[key]) TERM_TO_CATEGORY[key] = [];
        if (!TERM_TO_CATEGORY[key].includes(cat))
          TERM_TO_CATEGORY[key].push(cat);
      });
    });

    const keys = Object.keys(TERM_TO_CATEGORY)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex);
    termsRegex = keys.length
      ? new RegExp(`\\b(${keys.join("|")})\\b`, "ig")
      : null;
  }

  function makeSnippet(text, index, matchLen, radius = 40) {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + matchLen + radius);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    const raw = text.slice(start, end).trim();
    return prefix + raw.replace(/\s+/g, " ") + suffix;
  }

  function scoreMatch(matchedText, term) {
    return matchedText.toLowerCase() === term.toLowerCase() ? 1.0 : 0.8;
  }

  function scanText(fullText, options = {}) {
    if (!termsRegex) return {};

    const maxTextLength = options.maxTextLength || DEFAULT_MAX_TEXT;
    const sample =
      fullText.length > maxTextLength
        ? fullText.slice(0, maxTextLength)
        : fullText;

    const found = {};
    let m;

    termsRegex.lastIndex = 0;
    while ((m = termsRegex.exec(sample)) !== null) {
      const matched = m[1];
      const key = matched.toLowerCase();
      const cats = TERM_TO_CATEGORY[key] || [];

      if (
        options.categories?.length &&
        !cats.some((c) => options.categories.includes(c))
      )
        continue;

      const index = m.index;
      const snippet = makeSnippet(sample, index, matched.length, 40);
      const sc = scoreMatch(matched, key);

      cats.forEach((c) => {
        if (!found[c]) found[c] = {};
        if (!found[c][key]) found[c][key] = [];

        found[c][key].push({
          match: matched,
          snippet,
          index,
          score: sc,
        });
      });
    }

    const result = {};
    Object.entries(found).forEach(([cat, termsMap]) => {
      result[cat] = [];
      Object.entries(termsMap).forEach(([term, matches]) => {
        result[cat].push({ term, matches });
      });
    });
    return result;
  }

  function removeHighlights() {
    document.querySelectorAll("mark.privacy-highlight").forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      }
    });
  }

  function highlightMatchesInDOM(options = {}) {
    if (!termsRegex) return;
    removeHighlights();

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim())
            return NodeFilter.FILTER_REJECT;
          const tag =
            node.parentElement && node.parentElement.tagName.toLowerCase();
          if (
            ["script", "style", "textarea", "noscript", "code", "pre"].includes(
              tag
            )
          )
            return NodeFilter.FILTER_REJECT;
          if (tag === "a") return NodeFilter.FILTER_REJECT; // keep links clickable
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false
    );

    let node;
    let counter = 0;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let m;

      termsRegex.lastIndex = 0;
      while ((m = termsRegex.exec(text))) {
        const matched = m[1];
        const termCats = TERM_TO_CATEGORY[matched.toLowerCase()] || [];

        if (
          options.categories?.length &&
          !termCats.some((c) => options.categories.includes(c))
        )
          continue;

        const before = text.slice(lastIdx, m.index);
        if (before) frag.appendChild(document.createTextNode(before));

        const mark = document.createElement("mark");
        mark.className = "privacy-highlight";
        mark.textContent = m[0];
        mark.dataset.term = matched.toLowerCase();
        mark.dataset.highlightId = counter++;
        frag.appendChild(mark);

        lastIdx = termsRegex.lastIndex;
      }

      const after = text.slice(lastIdx);
      if (after) frag.appendChild(document.createTextNode(after));

      node.parentNode.replaceChild(frag, node);
    }
  }

  let highlightTimeout = null;
  const mutationObserver = new MutationObserver(() => {
    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(() => {
      try {
        highlightMatchesInDOM();
      } catch (e) {
        console.error("Highlight error:", e);
      }
    }, 600);
  });

  if (document.body)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.cmd === "scrollToTerm") {
      const term = message.term.toLowerCase();
      const el = Array.from(
        document.querySelectorAll("mark.privacy-highlight")
      ).find((m) => m.dataset.term === term);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const original = el.style.backgroundColor;
        el.style.backgroundColor = "#ffd966";
        setTimeout(() => (el.style.backgroundColor = original), 800);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    return false;
  });

  return {
    rebuildIndex,
    scanText,
    highlightMatchesInDOM,
    removeHighlights,
    TERM_TO_CATEGORY,
  };
})();

Object.defineProperty(window, "__privacyScanner", {
  value: {
    rebuildIndex: privacyScanner.rebuildIndex,
    scanTextForDebug: (maxChars) =>
      privacyScanner.scanText(document.body?.innerText ?? "", {
        maxTextLength: maxChars || 500_000,
      }),
    highlightMatchesInDOM: privacyScanner.highlightMatchesInDOM,
    removeHighlights: privacyScanner.removeHighlights,
    TERM_TO_CATEGORY: privacyScanner.TERM_TO_CATEGORY,
  },
  writable: false,
  configurable: false,
});
