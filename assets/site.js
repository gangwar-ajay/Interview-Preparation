/* Shared behavior: theme toggle + (on the home page) question list rendering. */

(function themeInit() {
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  if (saved === "dark" || saved === "light") {
    document.documentElement.dataset.theme = saved;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;

    function current() {
      var t = document.documentElement.dataset.theme;
      if (t) return t;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function paint() {
      btn.textContent = current() === "dark" ? "☀ Light" : "☾ Dark";
    }
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      paint();
    });
    paint();
  });
})();

/* Home page: render + filter the registry defined in assets/questions.js */
document.addEventListener("DOMContentLoaded", function () {
  var list = document.getElementById("question-list");
  if (!list || typeof QUESTIONS === "undefined") return;

  var search = document.getElementById("search");
  var chipRow = document.getElementById("topic-chips");
  var activeTopic = "All";

  var topics = ["All"];
  QUESTIONS.forEach(function (q) {
    if (topics.indexOf(q.topic) === -1) topics.push(q.topic);
  });

  topics.forEach(function (t) {
    var b = document.createElement("button");
    b.textContent = t;
    b.setAttribute("aria-pressed", t === activeTopic ? "true" : "false");
    b.addEventListener("click", function () {
      activeTopic = t;
      chipRow.querySelectorAll("button").forEach(function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      render();
    });
    chipRow.appendChild(b);
  });

  function render() {
    var term = (search.value || "").trim().toLowerCase();
    list.innerHTML = "";
    var shown = 0;

    QUESTIONS.forEach(function (q) {
      if (activeTopic !== "All" && q.topic !== activeTopic) return;
      var hay = (q.title + " " + q.topic + " " + q.tags.join(" ")).toLowerCase();
      if (term && hay.indexOf(term) === -1) return;

      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "questions/" + q.file;

      var title = document.createElement("div");
      title.className = "qtitle";
      title.textContent = q.title;

      var meta = document.createElement("div");
      meta.className = "qmeta";
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = q.topic;
      meta.appendChild(badge);
      meta.appendChild(document.createTextNode(q.tags.join(" · ")));

      a.appendChild(title);
      a.appendChild(meta);
      li.appendChild(a);
      list.appendChild(li);
      shown++;
    });

    document.getElementById("empty-note").hidden = shown !== 0;
  }

  search.addEventListener("input", render);
  render();
});
