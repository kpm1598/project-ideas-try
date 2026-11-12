/* =====================================================================
   Project Ideas — Ideas Wall
   Loads the public ideas feed from the Apps Script backend
   (GET <APPS_SCRIPT_URL>?feed=ideas) and renders one card per idea.

   PRIVACY: the feed is whitelisted on the server — it only ever
   contains name, idea, a short explanation excerpt, status and, for
   Completed projects, the live + repo links. This file reads ONLY
   those fields, and renders everything with textContent (never
   innerHTML), so a submission can never inject markup into the page.
   ===================================================================== */
(function () {
  "use strict";

  var grid = document.getElementById("wallGrid");
  var loading = document.getElementById("wallLoading");
  var emptyState = document.getElementById("wallEmpty");
  var errorState = document.getElementById("wallError");
  var errorText = document.getElementById("wallErrorText");
  var retryBtn = document.getElementById("wallRetry");
  if (!grid) return;

  function endpoint() {
    var cfg = window.PROJECT_IDEAS_CONFIG || {};
    return typeof cfg.APPS_SCRIPT_URL === "string" ? cfg.APPS_SCRIPT_URL.trim() : "";
  }
  function isPlaceholder(url) {
    return !url || url.indexOf("PASTE_YOUR") !== -1;
  }
  function feedUrl(url) {
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "feed=ideas";
  }

  function showOnly(el) {
    [loading, emptyState, errorState, grid].forEach(function (node) {
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

  function card(idea) {
    var status = STATUS_CLASS[idea.status] ? idea.status : "Submitted";

    var article = el("article", "idea-card reveal visible");

    var head = el("div", "idea-card-head");
    head.appendChild(el("h3", "idea-card-title", idea.idea || "Untitled idea"));
    var pill = el("span", "status-pill " + STATUS_CLASS[status], status);
    head.appendChild(pill);
    article.appendChild(head);

    if (idea.name) article.appendChild(el("p", "idea-card-by", "by " + idea.name));
    if (idea.explanation) article.appendChild(el("p", "idea-card-text", idea.explanation));

    if (status === "Completed") {
      var live = safeUrl(idea.liveUrl);
      var repo = safeUrl(idea.repoUrl);
      if (live || repo) {
        var actions = el("div", "idea-card-actions");
        if (live) {
          var a = el("a", "btn btn-primary btn-sm", "View Project");
          a.href = live; a.target = "_blank"; a.rel = "noopener noreferrer";
          actions.appendChild(a);
        }
        if (repo) {
          var b = el("a", "btn btn-ghost btn-sm", "GitHub Repo");
          b.href = repo; b.target = "_blank"; b.rel = "noopener noreferrer";
          actions.appendChild(b);
        }
        article.appendChild(actions);
      }
    }
    return article;
  }

  function render(ideas) {
    grid.textContent = "";
    if (!ideas.length) { showOnly(emptyState); return; }
    ideas.forEach(function (idea) { grid.appendChild(card(idea || {})); });
    showOnly(grid);
  }

  function fail(message) {
    if (errorText) errorText.textContent = message;
    showOnly(errorState);
  }

  function load() {
    var url = endpoint();
    if (isPlaceholder(url)) {
      fail("The Ideas Wall isn't connected yet — the site owner needs to finish the one-time setup in SETUP_GOOGLE_SHEETS.md.");
      return;
    }
    showOnly(loading);
    fetch(feedUrl(url), { method: "GET" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.result !== "ok" || !Array.isArray(data.ideas)) {
          throw new Error("Bad feed");
        }
        render(data.ideas);
      })
      .catch(function () {
        fail("Please check your connection and try again.");
      });
  }

  if (retryBtn) retryBtn.addEventListener("click", load);
  load();
})();
