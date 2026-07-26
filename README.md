# Interview Preparation

A static website for interview preparation. Every question gets the full
seven-section treatment:

1. **Definition** — crisp, interview-ready
2. **Analogy** — everyday intuition
3. **Interactive visualization** — play with the concept, not just read it
4. **History → Current → Future** — where it came from, where it's going
5. **Example** — small, fully worked, concrete numbers
6. **Use cases** — where it shows up in the real world
7. **Math & Python** — the formula and runnable code

**Live site:** https://gangwar-ajay.github.io/Interview-Preparation/

## Enabling GitHub Pages (one-time setup)

1. On GitHub, open **Settings → Pages** for this repository.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Select branch **`main`** and folder **`/ (root)`**, then **Save**.
4. After a minute, the site is live at the URL above.

No build step is needed — the site is plain HTML/CSS/JS (`.nojekyll` disables
Jekyll processing).

## Asking a new question

Ask the question in a Claude session on this repository. Claude will:

1. Copy `questions/_template.html` to `questions/<slug>.html` and fill in all
   seven sections, including a hand-built interactive visualization.
2. Register the page in `assets/questions.js` so it appears on the home page
   (searchable, filterable by topic).
3. Commit and push — GitHub Pages republishes automatically.

## Project layout

```
index.html                  home page: search + topic filters + question list
assets/style.css            shared styles, light/dark themes
assets/site.js              theme toggle + home-page list rendering
assets/questions.js         question registry (one entry per answered question)
questions/_template.html    seven-section skeleton for new questions
questions/*.html            one page per question
```
