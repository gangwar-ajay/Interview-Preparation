/* Shared behavior: theme toggle, topic color identity, home-page list
   rendering, and (on question pages) the topic badge + sticky mini-nav. */

/* Explicit slot assignment for known topics; unknown future topics hash
   into one of the 8 --topic-N slots so they still get a stable color. */
var TOPIC_COLORS = { "LLMs": 1, "Deep Learning": 3, "Machine Learning": 2 };
function topicSlot(topic) {
  if (TOPIC_COLORS[topic]) return TOPIC_COLORS[topic];
  var h = 0;
  for (var i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}
function topicColorVar(topic) { return "var(--topic-" + topicSlot(topic) + ")"; }

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

  var statsEl = document.getElementById("stats");
  if (statsEl) {
    statsEl.innerHTML = "<strong>" + QUESTIONS.length + "</strong> question" +
      (QUESTIONS.length === 1 ? "" : "s") + " across <strong>" +
      (topics.length - 1) + "</strong> topic" + (topics.length - 1 === 1 ? "" : "s") +
      " · new ones added regularly";
  }

  topics.forEach(function (t) {
    var b = document.createElement("button");
    b.textContent = t;
    if (t !== "All") b.style.setProperty("--tc", topicColorVar(t));
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
      a.style.setProperty("--tc", topicColorVar(q.topic));

      var title = document.createElement("div");
      title.className = "qtitle";
      title.textContent = q.title;

      var meta = document.createElement("div");
      meta.className = "qmeta";
      var badge = document.createElement("span");
      badge.className = "badge";
      var dot = document.createElement("span");
      dot.className = "dot";
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(q.topic));
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

/* Question pages: colorize the topic line, set the page's --tc accent
   (used by section-number circles), and build a sticky jump-to-section nav. */
document.addEventListener("DOMContentLoaded", function () {
  var article = document.querySelector("article.question");
  var topicEl = document.querySelector(".q-topic");
  if (!article || !topicEl) return;

  var parts = topicEl.textContent.split("·").map(function (s) { return s.trim(); }).filter(Boolean);
  var topic = parts[0];
  if (topic) {
    article.style.setProperty("--tc", topicColorVar(topic));
    topicEl.innerHTML = "";
    var badge = document.createElement("span");
    badge.className = "topic-badge";
    var dot = document.createElement("span");
    dot.className = "dot";
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(topic));
    topicEl.appendChild(badge);
    if (parts.length > 1) {
      topicEl.appendChild(document.createTextNode(parts.slice(1).join(" · ")));
    }
  }

  var SECTION_LABELS = {
    definition: "Definition", analogy: "Analogy", visualization: "Visualization",
    history: "History", example: "Example", usecase: "Use cases", math: "Math & Code"
  };
  var sections = Array.prototype.slice.call(article.querySelectorAll(".qsection[id]"));
  if (!sections.length) return;

  var nav = document.createElement("nav");
  nav.className = "mini-nav";
  nav.setAttribute("aria-label", "Jump to section");
  var links = sections.map(function (sec) {
    var a = document.createElement("a");
    a.href = "#" + sec.id;
    a.textContent = SECTION_LABELS[sec.id] || sec.id;
    nav.appendChild(a);
    return a;
  });
  sections[0].parentElement.insertBefore(nav, sections[0]);

  if ("IntersectionObserver" in window) {
    var byId = {};
    sections.forEach(function (sec, i) { byId[sec.id] = links[i]; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("active"); });
          byId[entry.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-56px 0px -70% 0px", threshold: 0 });
    sections.forEach(function (sec) { observer.observe(sec); });
  }
});
