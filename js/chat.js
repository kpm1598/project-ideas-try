// ============================================================
// Project Ideas — AI help chat widget
// ------------------------------------------------------------
// A floating chat button + panel added to every page. The
// visitor's question is POSTed to the same Google Apps Script
// backend as the form (action=chat). The Apps Script calls the
// Groq AI API with a key stored ONLY in its Script Properties —
// no API key ever appears in this file or anywhere on the
// website, so there is nothing here for visitors to steal.
//
// If the AI is unreachable or not configured yet, the widget
// shows a friendly fallback pointing to the FAQ section instead
// of breaking. Chat messages are NOT saved anywhere — this chat
// cannot accept idea submissions; those go through the form.
// ============================================================
(function () {
  "use strict";

  var config = window.PROJECT_IDEAS_CONFIG || {};
  var ENDPOINT = config.APPS_SCRIPT_URL || "";
  var MAX_LEN = 500;
  var HISTORY_TURNS = 6; // messages of context sent with each question

  var onHomePage = /(^|\/)index\.html$/.test(window.location.pathname) ||
    /(^|\/)$/.test(window.location.pathname);
  var FAQ_URL = onHomePage ? "#faqs" : "index.html#faqs";
  var FORM_URL = onHomePage ? "#submit" : "index.html#submit";

  var history = []; // {role: "user"|"assistant", content: string}
  var busy = false;
  var greeted = false;

  // ---------- Build the widget DOM ----------
  var toggle = document.createElement("button");
  toggle.className = "chat-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open help chat");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement("section");
  panel.className = "chat-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Help chat");

  var header = document.createElement("div");
  header.className = "chat-header";
  var headerText = document.createElement("div");
  var title = document.createElement("p");
  title.className = "chat-title";
  title.textContent = "Idea Assistant";
  var subtitle = document.createElement("p");
  subtitle.className = "chat-subtitle";
  subtitle.textContent = "AI help for this website";
  headerText.appendChild(title);
  headerText.appendChild(subtitle);
  var closeBtn = document.createElement("button");
  closeBtn.className = "chat-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close help chat");
  closeBtn.textContent = "×";
  header.appendChild(headerText);
  header.appendChild(closeBtn);

  var messages = document.createElement("div");
  messages.className = "chat-messages";
  messages.setAttribute("aria-live", "polite");

  var chips = document.createElement("div");
  chips.className = "chat-chips";
  ["How do I submit an idea?", "Will my idea be public?", "What do the statuses mean?"]
    .forEach(function (q) {
      var chip = document.createElement("button");
      chip.className = "chat-chip";
      chip.type = "button";
      chip.textContent = q;
      chip.addEventListener("click", function () { send(q); });
      chips.appendChild(chip);
    });

  var form = document.createElement("form");
  form.className = "chat-form";
  var input = document.createElement("input");
  input.className = "chat-input";
  input.type = "text";
  input.maxLength = MAX_LEN;
  input.placeholder = "Ask about this website…";
  input.setAttribute("aria-label", "Your question");
  input.autocomplete = "off";
  var sendBtn = document.createElement("button");
  sendBtn.className = "chat-send";
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  form.appendChild(input);
  form.appendChild(sendBtn);

  var note = document.createElement("p");
  note.className = "chat-note";
  note.textContent = "Chat can't submit ideas — please use the form. Answers are AI-generated; for anything important, email kppatel1713@gmail.com.";

  panel.appendChild(header);
  panel.appendChild(messages);
  panel.appendChild(chips);
  panel.appendChild(form);
  panel.appendChild(note);

  document.body.appendChild(panel);
  document.body.appendChild(toggle);

  // ---------- Helpers ----------
  function addMessage(role, text) {
    var row = document.createElement("div");
    row.className = "chat-row " + role;
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = text; // textContent only — replies can never inject HTML
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function addFallback() {
    var row = document.createElement("div");
    row.className = "chat-row bot";
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.appendChild(document.createTextNode(
      "Sorry, I couldn't answer that right now. You may find it in the "));
    var faqLink = document.createElement("a");
    faqLink.href = FAQ_URL;
    faqLink.textContent = "FAQs";
    bubble.appendChild(faqLink);
    bubble.appendChild(document.createTextNode(", or use the "));
    var formLink = document.createElement("a");
    formLink.href = FORM_URL;
    formLink.textContent = "submission form";
    bubble.appendChild(formLink);
    bubble.appendChild(document.createTextNode(" to share your idea."));
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function setBusy(on) {
    busy = on;
    input.disabled = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? "…" : "Send";
  }

  function openPanel() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close help chat");
    if (!greeted) {
      greeted = true;
      addMessage("bot",
        "Hi! 👋 I'm the Idea Assistant. Ask me how to submit an idea, what happens after you submit, or what the Ideas Wall shows. How can I help?");
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open help chat");
    toggle.focus();
  }

  toggle.addEventListener("click", function () {
    if (panel.hidden) openPanel(); else closePanel();
  });
  closeBtn.addEventListener("click", closePanel);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  // ---------- Send a question ----------
  function send(text) {
    var message = (text || "").trim();
    if (!message || busy) return;
    if (!ENDPOINT) { addMessage("user", message); addFallback(); return; }

    addMessage("user", message);
    input.value = "";
    setBusy(true);
    var typing = addMessage("bot", "Typing…");
    typing.classList.add("chat-typing");

    var payload = new URLSearchParams();
    payload.set("action", "chat");
    payload.set("message", message.slice(0, MAX_LEN));
    payload.set("history", JSON.stringify(history.slice(-HISTORY_TURNS)));

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        typing.remove();
        if (data && data.result === "success" && data.reply) {
          addMessage("bot", data.reply);
          history.push({ role: "user", content: message });
          history.push({ role: "assistant", content: data.reply });
          history = history.slice(-HISTORY_TURNS * 2);
        } else {
          addFallback();
        }
      })
      .catch(function () {
        typing.remove();
        addFallback();
      })
      .finally(function () { setBusy(false); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });
})();
