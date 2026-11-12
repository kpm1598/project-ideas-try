// Project Ideas — custom submission form (js/form.js)
// Validates the 12 questions, tracks progress, posts them to the Google
// Apps Script endpoint from js/config.js (which appends them to a
// Google Sheet), and shows the success confirmation ONLY when the
// backend replies {"result":"success"}. Every submission carries a
// unique submissionId: retries reuse the same ID and the Apps Script
// deduplicates on it, so a retry can never create a double row.
(function () {
  "use strict";

  var form = document.getElementById("ideaForm");
  if (!form) return;

  var submitBtn = document.getElementById("submitBtn");
  var submitBtnText = document.getElementById("submitBtnText");
  var submitSpinner = document.getElementById("submitSpinner");
  var errorBanner = document.getElementById("formError");
  var errorText = document.getElementById("formErrorText");
  var successPanel = document.getElementById("formSuccess");
  var successIdeaName = document.getElementById("successIdeaName");
  var submitAnother = document.getElementById("submitAnother");
  var progressFill = document.getElementById("formProgressFill");
  var progressText = document.getElementById("formProgressText");
  var progressWrap = document.getElementById("formProgressBarWrap");

  var submitting = false; // in-flight guard against duplicate submits

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "sub-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }
  var submissionId = newId(); // one ID per form session; reset after success

  function endpoint() {
    var url = (window.PROJECT_IDEAS_CONFIG || {}).APPS_SCRIPT_URL || "";
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url.trim()) ? url.trim() : null;
  }

  // ---------- helpers ----------
  function value(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }
  function radioValue(name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : "";
  }

  // ---------- progress indicator ----------
  // Progress = how many of the 7 required groups are completed.
  function updateProgress() {
    var done = 0;
    if (value("fullName")) done++;
    if (value("usn")) done++;
    if (value("email")) done++;
    if (value("ideaName")) done++;
    if (radioValue("appType")) done++;
    if (value("ideaExplain")) done++;
    if (value("problem")) done++;
    var pct = Math.round((done / 7) * 100);
    if (progressFill) progressFill.style.width = pct + "%";
    if (progressWrap) progressWrap.setAttribute("aria-valuenow", String(pct));
    if (progressText) {
      progressText.textContent = done === 7
        ? "All 7 required fields completed — ready to submit!"
        : done + " of 7 required fields completed";
    }
  }
  form.addEventListener("input", updateProgress);
  form.addEventListener("change", updateProgress);

  // ---------- character counters ----------
  form.querySelectorAll("textarea[data-counter]").forEach(function (ta) {
    var counter = form.querySelector('[data-count-for="' + ta.id + '"]');
    function update() {
      if (counter) counter.textContent = ta.value.length + " / " + ta.maxLength;
    }
    ta.addEventListener("input", update);
    update();
  });

  // ---------- validation ----------
  function setError(fieldId, message) {
    var err = document.getElementById("err-" + fieldId);
    var input = document.getElementById(fieldId);
    if (err) {
      err.textContent = message || "";
      err.hidden = !message;
    }
    if (input && message) input.setAttribute("aria-invalid", "true");
    if (input && !message) input.removeAttribute("aria-invalid");
    return !message;
  }

  function validate() {
    var ok = true;
    var firstBad = null;
    function fail(id, msg, focusEl) {
      setError(id, msg);
      ok = false;
      if (!firstBad) firstBad = focusEl || document.getElementById(id);
    }
    function pass(id) { setError(id, ""); }

    if (!value("fullName")) fail("fullName", "Please enter your full name."); else pass("fullName");

    if (!value("usn")) fail("usn", "Please enter your USN."); else pass("usn");

    var email = value("email");
    if (!email) fail("email", "Please enter your email address.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email", "That email address doesn't look complete — please check it."); else pass("email");

    if (!value("ideaName")) fail("ideaName", "Please give your idea or application a name."); else pass("ideaName");

    var cards = form.querySelector(".select-cards");
    if (!radioValue("appType")) {
      setError("appType", "Please choose the type of application — pick “Not sure yet” if you're unsure.");
      if (cards) cards.classList.add("invalid");
      ok = false;
      if (!firstBad && cards) firstBad = cards.querySelector("input");
    } else {
      setError("appType", "");
      if (cards) cards.classList.remove("invalid");
    }

    if (!value("ideaExplain")) fail("ideaExplain", "Please explain your idea in a few lines."); else pass("ideaExplain");
    if (!value("problem")) fail("problem", "Please tell us what problem your idea solves."); else pass("problem");

    if (firstBad && firstBad.focus) firstBad.focus();
    return ok;
  }

  ["fullName", "usn", "email", "ideaName", "ideaExplain", "problem"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", function () { setError(id, ""); });
  });
  form.querySelectorAll('input[name="appType"]').forEach(function (r) {
    r.addEventListener("change", function () {
      setError("appType", "");
      var cards = form.querySelector(".select-cards");
      if (cards) cards.classList.remove("invalid");
    });
  });

  // ---------- submit ----------
  function setLoading(on) {
    submitting = on;
    submitBtn.disabled = on;
    submitSpinner.hidden = !on;
    submitBtnText.textContent = on ? "Submitting your idea…" : "Submit Your Idea";
  }
  function showError(message) {
    errorText.textContent = message;
    errorBanner.hidden = false;
    errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function hideError() { errorBanner.hidden = true; }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (submitting) return; // a submission is already in flight
    hideError();

    if (!validate()) {
      showError("Some required fields are missing or need a fix — they're marked in red above.");
      return;
    }

    var url = endpoint();
    if (!url) {
      // No real endpoint configured yet — be honest instead of faking success.
      showError("This form isn't connected to its Google Sheet yet, so nothing was submitted. The site owner needs to finish the one-time setup in SETUP_GOOGLE_SHEETS.md and paste the Apps Script URL into js/config.js.");
      return;
    }

    var payload = {
      submissionId: submissionId,
      fullName: value("fullName"),
      usn: value("usn"),
      email: value("email"),
      ideaName: value("ideaName"),
      appType: radioValue("appType"),
      ideaExplain: value("ideaExplain"),
      problem: value("problem"),
      beneficiaries: value("beneficiaries"),
      features: value("features"),
      aiInvolved: radioValue("aiInvolved"),
      collaborate: radioValue("collaborate"),
      comments: value("comments"),
      consent: (document.getElementById("consent") && document.getElementById("consent").checked) ? "Yes" : "No",
      pageUrl: window.location.href
    };

    setLoading(true);

    // The request uses a simple urlencoded body (no CORS preflight), and
    // the Apps Script answers with JSON. Success is shown ONLY when that
    // JSON confirms {"result":"success"} — a network failure, an HTTP
    // error, or a script-side error all show the error state instead.
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(payload).toString()
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.result !== "success") {
          throw new Error((data && data.error) || "Backend did not confirm success.");
        }
        form.hidden = true;
        successPanel.hidden = false;
        if (successIdeaName) successIdeaName.textContent = "“" + payload.ideaName + "”";
        successPanel.focus();
        successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
        submissionId = newId(); // next submission is a new, distinct entry
      })
      .catch(function () {
        showError("We couldn't confirm your submission with the server. Check your internet connection and try again — retrying is safe (your submission carries a unique ID, so it can't be recorded twice), and your answers are still in the form.");
      })
      .finally(function () { setLoading(false); });
  });

  if (submitAnother) {
    submitAnother.addEventListener("click", function () {
      form.reset();
      successPanel.hidden = true;
      form.hidden = false;
      hideError();
      updateProgress();
      form.querySelectorAll("textarea[data-counter]").forEach(function (ta) {
        var counter = form.querySelector('[data-count-for="' + ta.id + '"]');
        if (counter) counter.textContent = "0 / " + ta.maxLength;
      });
      var first = document.getElementById("fullName");
      if (first) first.focus();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  updateProgress();
})();
