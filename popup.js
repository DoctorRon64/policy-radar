/* popup.js – ES module */
"use strict";

/* -------------------------------------------------------------
 *  Constants & Helpers
 * ------------------------------------------------------------- */
const allCategories = [
  "Health",
  "Purchases",
  "Financial",
  "Location",
  "Contact Info",
  "User Content",
  "Search",
  "Browsing",
  "Identifiers",
  "Usage Data",
  "Sensitive Info",
  "Diagnostics",
  "Other Data",
];

// Simple wrapper that throws if an element is missing (helps during dev)
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

const resultsContainer = $("#results");
const metaEl = $("#meta");

let selectedCategories = new Set(allCategories);

/* -------------------------------------------------------------
 *  Toolbar button handling (stateful Set)
 * ------------------------------------------------------------- */
document.querySelectorAll(".cat-btn").forEach((btn) => {
  const cat = btn.dataset.category;
  // Initialise visual state from the Set
  btn.classList.toggle("active", selectedCategories.has(cat));

  btn.addEventListener("click", () => {
    selectedCategories.toggle(cat);
    btn.classList.toggle("active", selectedCategories.has(cat));
  });
});

/* -------------------------------------------------------------
 *  Core scanning logic
 * ------------------------------------------------------------- */

/**
 * Send a scan request to the content script.
 *
 * @param {boolean} highlight  Whether the page should be highlighted.
 */
async function sendScan(highlight = false) {
  const catsArray = Array.from(selectedCategories);
  const tab = await getActiveTab();
  if (!tab?.id) return;

  // The content script listens for a message with cmd:'scan'
  chrome.tabs.sendMessage(
    tab.id,
    { cmd: "scan", highlight, categories: catsArray },
    (resp) => {
      if (chrome.runtime.lastError) {
        resultsContainer.textContent =
          "Content script not available on this page.";
        return;
      }

      // Show page meta info
      metaEl.textContent = `${resp.title} — ${resp.url}`;

      // Render the structured results
      renderResults(resp.results);

      // Persist the latest report for “Copy Report”
      chrome.storage.local.set({
        lastReport: {
          meta: { title: resp.title, url: resp.url },
          results: resp.results,
        },
      });
    }
  );
}

/* -------------------------------------------------------------
 *  Rendering helpers
 * ------------------------------------------------------------- */

/**
 * Render the scan results into the #results container.
 *
 * @param {object} res  The object returned by the content script:
 *                      { Category → [{ term, matches[] }] }
 */
function renderResults(res) {
  resultsContainer.innerHTML = "";

  if (!res || Object.keys(res).length === 0) {
    resultsContainer.textContent = "No matches found.";
    return;
  }

  // Sort categories alphabetically for a stable UI
  Object.keys(res)
    .sort()
    .forEach((cat) => {
      if (!selectedCategories.has(cat)) return; // hidden by toolbar

      const catDiv = document.createElement("div");
      catDiv.className = "cat";

      const heading = document.createElement("strong");
      heading.textContent = `${cat} — ${res[cat].length} term(s)`;
      catDiv.appendChild(heading);

      const termsDiv = document.createElement("div");
      termsDiv.className = "terms";

      // Each term entry
      res[cat].forEach((tObj) => {
        const termSpan = document.createElement("span");
        termSpan.className = "term";
        termSpan.textContent = tObj.term;
        termSpan.dataset.term = tObj.term; // for delegation
        termsDiv.appendChild(termSpan);

        // Show the first snippet (if any) next to the term
        if (tObj.matches && tObj.matches.length) {
          const snippet = document.createElement("span");
          snippet.className = "snippet";
          snippet.textContent = tObj.matches[0].snippet;
          termsDiv.appendChild(snippet);
        }
      });

      catDiv.appendChild(termsDiv);
      resultsContainer.appendChild(catDiv);
    });
}

/* -------------------------------------------------------------
 *  Interaction: scroll to a term when the user clicks it
 * ------------------------------------------------------------- */
resultsContainer.addEventListener("click", (e) => {
  const termEl = e.target.closest(".term");
  if (!termEl) return;
  scrollToTerm(termEl.dataset.term);
});

/**
 * Ask the content script to scroll to the first occurrence of a term.
 *
 * @param {string} term  The term to locate.
 */
function scrollToTerm(term) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { cmd: "scrollToTerm", term });
  });
}

/* -------------------------------------------------------------
 *  Copy report to clipboard
 * ------------------------------------------------------------- */
async function copyReport() {
  const { lastReport } = await chrome.storage.local.get("lastReport");
  if (!lastReport) {
    alert("No report to copy — run a scan first.");
    return;
  }

  const lines = [];
  lines.push(`URL: ${lastReport.meta.url}`);

  Object.entries(lastReport.results).forEach(([cat, terms]) => {
    if (!selectedCategories.has(cat)) return;
    terms.forEach((t) => {
      lines.push(`${cat}: ${t.term}`);
      t.matches.forEach((m) => lines.push(`  - ${m.snippet}`));
    });
  });

  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    alert("Report copied to clipboard");
  } catch (err) {
    // Fallback for environments where the Clipboard API is unavailable
    console.error(err);
    const manual = prompt("Copy the text manually:", text);
    if (manual !== null) alert("Report copied (via manual copy).");
  }
}

/* -------------------------------------------------------------
 *  Button wiring
 * ------------------------------------------------------------- */
$("#scanBtn").addEventListener("click", () => sendScan(false));
$("#scanAndHighlightBtn").addEventListener("click", () => sendScan(true));
$("#copyBtn").addEventListener("click", copyReport);

/* -------------------------------------------------------------
 *  Optional: expose a tiny debug helper on the window (dev only)
 * ------------------------------------------------------------- */
if (process.env.NODE_ENV !== "production") {
  window.__popupDebug = {
    selectedCategories,
    sendScan,
    renderResults,
  };
}
