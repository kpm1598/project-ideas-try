/* =====================================================================
   Project Ideas — individual idea page (idea.html?id=PI-0001)
   Loads ONE public idea from the Apps Script backend
   (GET <APPS_SCRIPT_URL>?feed=idea&id=<Public ID>) and renders it.

   PRIVACY: the detail feed is whitelisted on the server with the
   same rules as the Ideas Wall — a row is served only when the
   student consented AND the owner approved it, and it contains only
   the public fields (id, name, idea, brief, full explanation,
   status, and Completed-only links). Everything is rendered with
   textContent (never innerHTML), exactly like js/ideas.js, so a
   submission can never inject markup into the page.
   ===================================================================== */
(function () {
  "use strict";

  var loading = document.getElementById("ideaLoading");
  var notFound = document.getElementById("ideaNotFound");
  var errorState = document.getElementById("ideaError");
  var errorText = document.getElementById("ideaErrorText");
  var retryBtn = document.getElementById("ideaRetry");
  var content = document.getElementById("ideaContent");
  if (!content) return;

  var titleEl = document.getElementById("ideaTitle");
  var pillEl = document.getElementById("ideaStatusPill");
  var byEl = document.getElementById("ideaBy");
  var briefBlock = document.getElementById("ideaBriefBlock");
  var briefEl = document.getElementById("ideaBrief");
  var fullEl = document.getElementById("ideaFull");
  var actionsEl = document.getElementById("ideaActions");

  function endpoint() {
    var cfg = window.PROJECT_IDEAS_CONFIG || {};
    return typeof cfg.APPS_SCRIPT_URL === "string" ? cfg.APPS_SCRIPT_URL.trim() : "";
  }
  function isPlaceholder(url) {
    return !url || url.indexOf("PASTE_YOUR") !== -1;
  }
  function detailUrl(url, id) {
    return url + (url.indexOf("?") === -1 ? "?" : "&") +
      "feed=idea&id=" + encodeURIComponent(id);
  }

  function showOnly(el) {
    [loading, notFound, errorState, content].forEach(function (node) {
      if (node) node.hidden = node !== el;
    });
  }

  var STATUS_CLASS = {
    "Submitted": "status-submitted",
    "In Progress": "status-progress",
    "Completed": "status-completed"
  };

  function safeUrl(u) {
    return typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : "";
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function render(idea) {
    var status = STATUS_CLASS[idea.status] ? idea.status : "Submitted";

    document.title = (idea.idea || "Idea") + " — Project Ideas";
    titleEl.textContent = idea.idea || "Untitled idea";

    pillEl.textContent = "";
    var pill = el("span", "status-pill " + STATUS_CLASS[status], status);
    pillEl.appendChild(pill);

    byEl.textContent = idea.name ? "by " + idea.name : "";
    byEl.hidden = !idea.name;

    if (idea.brief) {
      briefEl.textContent = idea.brief;
      briefBlock.hidden = false;
    } else {
      briefBlock.hidden = true;
    }

    fullEl.textContent = idea.explanation || "";

    actionsEl.textContent = "";
    if (status === "Completed") {
      var live = safeUrl(idea.liveUrl);
      var repo = safeUrl(idea.repoUrl);
      if (live) {
        var a = el("a", "btn btn-primary", "View Project");
        a.href = live; a.target = "_blank"; a.rel = "noopener noreferrer";
        actionsEl.appendChild(a);
      }
      if (repo) {
        var b = el("a", "btn btn-ghost", "GitHub Repo");
        b.href = repo; b.target = "_blank"; b.rel = "noopener noreferrer";
        actionsEl.appendChild(b);
      }
    }
    showOnly(content);
  }

  function fail(message) {
    if (errorText) errorText.textContent = message;
    showOnly(errorState);
  }

  function load() {
    var id = "";
    try {
      id = new URLSearchParams(window.location.search).get("id") || "";
    } catch (e) { /* very old browser — treated as not found below */ }
    if (!id.trim()) { showOnly(notFound); return; }

    var url = endpoint();
    if (isPlaceholder(url)) {
      fail("This page isn't connected yet — the site owner needs to finish the one-time setup in SETUP_GOOGLE_SHEETS.md.");
      return;
    }
    showOnly(loading);
    fetch(detailUrl(url, id.trim()), { method: "GET" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.result === "ok" && data.idea) {
          render(data.idea);
        } else if (data && data.result === "error") {
          // The only error the detail feed returns is "Idea not
          // found." (unknown and non-public ids look identical).
          showOnly(notFound);
        } else {
          throw new Error("Bad feed");
        }
      })
      .catch(function () {
        fail("Please check your connection and try again.");
      });
  }

  if (retryBtn) retryBtn.addEventListener("click", load);
  load();
})();
