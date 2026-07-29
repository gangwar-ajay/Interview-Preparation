/* Narrated explainer player.
   Turns a set of .ex-scene elements into a "video": animated scenes with
   voice-over from the browser's built-in speech synthesis (no media files,
   no external services — works on any static host).

   Markup contract (see any question page for an example):
     <div class="explainer" id="X">
       <div class="ex-stage">
         <div class="ex-scene" data-narration="…">…visuals…</div>
         <div class="ex-scene" data-narration="…">…visuals…</div>
       </div>
     </div>
   The player builds its own controls, caption bar and progress track.

   Robustness notes:
   - Narration is split into sentences; Chrome truncates long utterances,
     so each chunk is spoken separately.
   - If speech synthesis is unavailable or has no voices (common on Linux
     desktop), the player still runs, timed from word count, with captions.
   - Autoplay policies require a gesture: playback only starts on click. */

(function () {
  function ExplainerPlayer(root) {
    this.root = root;
    this.scenes = Array.prototype.slice.call(root.querySelectorAll(".ex-scene"));
    if (!this.scenes.length) return;

    this.i = 0;
    this.playing = false;
    this.muted = false;
    this.timer = null;
    this.chunks = [];
    this.chunkIndex = 0;
    this._k = 0;          // sentence index within the current scene
    this._elapsed = 0;    // ms already played in this scene (silent mode)
    this._softPaused = false;

    // Playback preferences, remembered across visits.
    // 0.9 default: browser-default 1.0 reads noticeably fast for explanation.
    this.rate = 0.9;
    this._voiceName = null;
    try {
      var savedRate = parseFloat(localStorage.getItem("ex-rate"));
      if (savedRate >= 0.5 && savedRate <= 2) this.rate = savedRate;
      this._voiceName = localStorage.getItem("ex-voice") || null;
    } catch (e) {}

    this.scenes.forEach(function (s, i) {
      s.dataset.index = i;
      // Pre-split narration into sentence chunks
      var text = (s.dataset.narration || "").trim();
      s._chunks = text ? text.match(/[^.!?]+[.!?]*/g).map(function (t) { return t.trim(); }).filter(Boolean) : [];
    });

    // Optional code-walkthrough mode: one shared code panel whose lines get
    // highlighted per scene via data-lines="start-end" (1-based, inclusive).
    this.codeEl = root.querySelector(".ex-code");
    if (this.codeEl) this.prepareCode();

    this.buildUI();
    this.show(0);
  }

  /* Split the code block into per-line rows so scenes can highlight ranges.
     Text only — no syntax parsing, so nothing can be mis-escaped. */
  ExplainerPlayer.prototype.prepareCode = function () {
    var lines = this.codeEl.textContent.replace(/\n+$/, "").split("\n");
    this.codeEl.textContent = "";
    this.codeLines = lines.map(function (line, i) {
      var row = document.createElement("div");
      row.className = "ex-line";
      var num = document.createElement("span");
      num.className = "ex-lnum";
      num.textContent = i + 1;
      var txt = document.createElement("span");
      txt.className = "ex-ltext";
      txt.textContent = line || " ";
      row.appendChild(num);
      row.appendChild(txt);
      this.codeEl.appendChild(row);
      return row;
    }, this);
  };

  ExplainerPlayer.prototype.highlightLines = function (spec) {
    if (!this.codeLines) return;
    var ranges = (spec || "").split(",").map(function (r) {
      var m = r.trim().split("-");
      return [parseInt(m[0], 10), parseInt(m[1] === undefined ? m[0] : m[1], 10)];
    }).filter(function (r) { return !isNaN(r[0]); });

    var any = ranges.length > 0;
    var first = null;
    this.codeLines.forEach(function (row, idx) {
      var n = idx + 1;
      var on = ranges.some(function (r) { return n >= r[0] && n <= r[1]; });
      row.classList.toggle("hot", on);
      row.classList.toggle("dim", any && !on);
      if (on && first === null) first = row;
    });

    if (first && this.codeEl.scrollHeight > this.codeEl.clientHeight) {
      var target = first.offsetTop - this.codeEl.clientHeight / 3;
      this.codeEl.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  };

  ExplainerPlayer.prototype.speechAvailable = function () {
    return typeof window.speechSynthesis !== "undefined" &&
           typeof window.SpeechSynthesisUtterance !== "undefined";
  };

  ExplainerPlayer.prototype.buildUI = function () {
    var self = this;

    var caption = document.createElement("div");
    caption.className = "ex-caption";
    caption.setAttribute("aria-live", "polite");
    this.caption = caption;

    var track = document.createElement("div");
    track.className = "ex-track";
    var fill = document.createElement("i");
    track.appendChild(fill);
    this.fill = fill;

    var bar = document.createElement("div");
    bar.className = "ex-controls";

    this.playBtn = document.createElement("button");
    this.playBtn.type = "button";
    this.playBtn.className = "primary";
    this.playBtn.textContent = "▶ Play explainer";
    this.playBtn.addEventListener("click", function () {
      self.playing ? self.pause() : self.play();
    });

    var prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "⏮";
    prev.title = "Previous scene";
    prev.addEventListener("click", function () { self.jump(self.i - 1); });

    var next = document.createElement("button");
    next.type = "button";
    next.textContent = "⏭";
    next.title = "Next scene";
    next.addEventListener("click", function () { self.jump(self.i + 1); });

    this.muteBtn = document.createElement("button");
    this.muteBtn.type = "button";
    this.muteBtn.textContent = "🔊 Sound on";
    this.muteBtn.addEventListener("click", function () {
      self.muted = !self.muted;
      self.muteBtn.textContent = self.muted ? "🔇 Sound off" : "🔊 Sound on";
      if (self.muted) self.cancelSpeech();
      self._softPaused = false;
      if (self.playing) { self.stopTimer(); self.runScene(); }   // re-time without voice
    });

    var chips = document.createElement("div");
    chips.className = "ex-chips";
    this.chips = this.scenes.map(function (s, i) {
      var c = document.createElement("button");
      c.type = "button";
      c.textContent = (i + 1) + ". " + (s.dataset.title || "Scene " + (i + 1));
      c.addEventListener("click", function () { self.jump(i); });
      chips.appendChild(c);
      return c;
    });

    bar.appendChild(this.playBtn);
    bar.appendChild(prev);
    bar.appendChild(next);
    bar.appendChild(this.muteBtn);

    // Speed + voice pickers (persisted, so a visitor sets them once)
    var opts = document.createElement("div");
    opts.className = "ex-opts";

    var speedLabel = document.createElement("label");
    speedLabel.textContent = "Speed ";
    this.speedSel = document.createElement("select");
    [["0.7", "0.7× slowest"], ["0.8", "0.8× slower"], ["0.9", "0.9× relaxed"],
     ["1", "1× normal"], ["1.15", "1.15× brisk"], ["1.3", "1.3× fast"]]
      .forEach(function (o) {
        var el = document.createElement("option");
        el.value = o[0]; el.textContent = o[1];
        if (parseFloat(o[0]) === self.rate) el.selected = true;
        self.speedSel.appendChild(el);
      });
    this.speedSel.addEventListener("change", function () {
      self.rate = parseFloat(self.speedSel.value);
      try { localStorage.setItem("ex-rate", self.speedSel.value); } catch (e) {}
      if (self.playing) { self.stopTimer(); self.cancelSpeech(); self._softPaused = false; self.runScene(); }
    });
    speedLabel.appendChild(this.speedSel);

    var voiceLabel = document.createElement("label");
    voiceLabel.textContent = "Voice ";
    this.voiceSel = document.createElement("select");
    this.voiceSel.hidden = true;
    this.voiceSel.addEventListener("change", function () {
      self._voiceName = self.voiceSel.value;
      try { localStorage.setItem("ex-voice", self._voiceName); } catch (e) {}
      if (self.playing) { self.stopTimer(); self.cancelSpeech(); self._softPaused = false; self.runScene(); }
    });
    voiceLabel.appendChild(this.voiceSel);

    opts.appendChild(speedLabel);
    opts.appendChild(voiceLabel);
    this.optsEl = opts;

    this.fillVoicePicker();
    if (this.speechAvailable()) {
      try {
        window.speechSynthesis.addEventListener("voiceschanged", function () {
          self.fillVoicePicker();
        });
      } catch (e) {}
    }

    var note = document.createElement("p");
    note.className = "ex-note";
    this.noteEl = note;
    note.textContent = this.speechAvailable()
      ? "Voice-over uses your device's built-in speech synthesis. Captions show below either way."
      : "Your browser has no speech synthesis, so this plays silently with captions.";

    var stage = this.root.querySelector(".ex-stage");
    this.root.insertBefore(track, stage.nextSibling);
    this.root.insertBefore(caption, track.nextSibling);
    this.root.insertBefore(bar, caption.nextSibling);
    this.root.insertBefore(opts, bar.nextSibling);
    this.root.insertBefore(chips, opts.nextSibling);
    this.root.appendChild(note);
  };

  ExplainerPlayer.prototype.show = function (i) {
    this.i = Math.max(0, Math.min(this.scenes.length - 1, i));
    var self = this;
    this.scenes.forEach(function (s, k) {
      s.classList.toggle("active", k === self.i);
    });
    this.chips.forEach(function (c, k) {
      c.setAttribute("aria-pressed", k === self.i ? "true" : "false");
    });
    this.caption.textContent = this.scenes[this.i].dataset.narration || "";
    if (this.codeLines) this.highlightLines(this.scenes[this.i].dataset.lines);
    this.updateProgress(0);
  };

  ExplainerPlayer.prototype.updateProgress = function (within) {
    var frac = (this.i + (within || 0)) / this.scenes.length;
    this.fill.style.width = (frac * 100) + "%";
  };

  ExplainerPlayer.prototype.play = function () {
    this.playing = true;
    this.playBtn.textContent = "❚❚ Pause";
    this.root.classList.add("playing");

    /* True mid-sentence resume where the engine supports it. Otherwise we
       fall through to runScene(), which picks up at this._k — the sentence
       that was interrupted — rather than restarting the whole scene. */
    if (this._softPaused) {
      this._softPaused = false;
      if (this.speechAvailable()) {
        try {
          if (window.speechSynthesis.paused && window.speechSynthesis.speaking) {
            window.speechSynthesis.resume();
            return;
          }
        } catch (e) {}
      }
    }
    this.runScene();
  };

  ExplainerPlayer.prototype.pause = function () {
    this.playing = false;
    this.playBtn.textContent = "▶ Resume";
    this.root.classList.remove("playing");
    this.stopTimer();

    // Bank how far into the scene we got, so silent playback resumes correctly.
    if (this._sceneStart) {
      this._elapsed += Date.now() - this._sceneStart;
      this._sceneStart = 0;
    }

    if (this.speechAvailable() && !this.muted && !this._speechBroken) {
      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();   // keeps position; resume() continues
          this._softPaused = true;
          // Some builds no-op pause(). If it didn't take, cancel outright —
          // resume then restarts the interrupted sentence via this._k.
          var self2 = this;
          setTimeout(function () {
            if (!self2._softPaused) return;
            try {
              if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                self2._softPaused = false;
                window.speechSynthesis.cancel();
              }
            } catch (e) {}
          }, 220);
          return;
        }
      } catch (e) {}
    }
    this.cancelSpeech();
  };

  ExplainerPlayer.prototype.stopTimer = function () {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  };

  ExplainerPlayer.prototype.cancelSpeech = function () {
    if (this.speechAvailable()) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  };

  ExplainerPlayer.prototype.jump = function (i) {
    var wasPlaying = this.playing;
    this.stopTimer();
    this.cancelSpeech();
    // Explicit navigation always starts the target scene from the top.
    this._k = 0; this._elapsed = 0; this._sceneStart = 0; this._softPaused = false;
    if (i < 0 || i >= this.scenes.length) {
      this.playing = false;
      this.playBtn.textContent = "▶ Replay";
      this.root.classList.remove("playing");
      this.show(Math.min(Math.max(i, 0), this.scenes.length - 1));
      return;
    }
    this.show(i);
    if (wasPlaying) this.runScene();
  };

  /* Estimate reading time when there's no voice: ~2.6 words/second at 1×. */
  ExplainerPlayer.prototype.estimate = function (text) {
    var words = text.split(/\s+/).filter(Boolean).length;
    var ms = (words / (2.6 * (this.rate || 1))) * 1000 + 500;
    return Math.max(2200, ms);
  };

  ExplainerPlayer.prototype.runScene = function () {
    if (!this.playing) return;
    var self = this;
    var scene = this.scenes[this.i];

    // Replay the scene's entrance animation only when starting it fresh,
    // not when resuming mid-scene after a pause.
    if (!this._elapsed && !this._k) {
      scene.classList.remove("active");
      void scene.offsetWidth;
      scene.classList.add("active");
    }

    var chunks = scene._chunks;
    var useVoice = this.speechAvailable() && !this.muted && !this._speechBroken && chunks.length;

    if (!useVoice) {
      var ms = this.estimate(scene.dataset.narration || "");
      this._sceneStart = Date.now();
      var tick = function () {
        if (!self.playing) return;
        var done = self._elapsed + (Date.now() - self._sceneStart);
        var f = Math.min(1, done / ms);
        self.updateProgress(f);
        if (f < 1) self.timer = setTimeout(tick, 100);
        else { self._sceneStart = 0; self.advance(); }
      };
      tick();
      return;
    }

    // Speak sentence chunks in sequence (avoids Chrome's long-utterance cutoff).
    // Starts at this._k so a pause resumes at the interrupted sentence.
    this.cancelSpeech();
    var k = Math.min(this._k || 0, chunks.length);
    var watchdog = null;

    /* Some environments expose speechSynthesis but can't actually speak
       (no installed voices — common on Linux, and in headless browsers).
       There, utterances "end" instantly without ever starting, which would
       race the whole explainer to the end. Detect that and switch to
       timed playback with captions instead. */
    var fallback = function () {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      self._speechBroken = true;
      self.cancelSpeech();
      if (self.muteBtn) self.muteBtn.disabled = true;
      if (self.noteEl) {
        self.noteEl.textContent = "No speech voices are available on this device, so this is playing silently with captions.";
      }
      self.runScene();
    };

    var speakNext = function () {
      if (!self.playing) return;
      self._k = k;                       // remember position for pause/resume
      if (k >= chunks.length) { self.advance(); return; }
      self.updateProgress(k / chunks.length);

      var u = new SpeechSynthesisUtterance(chunks[k]);
      u.rate = self.rate;
      u.pitch = 1.0;
      var v = self.pickVoice();
      // Assigning .voice can throw if the list went stale between reads;
      // the browser default is an acceptable outcome, silence is not.
      if (v) { try { u.voice = v; } catch (e) {} }

      var started = false;
      u.onstart = function () { started = true; self._speechWorks = true; };

      var done = function () {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        // Never started and no prior successful speech => synthesis is a no-op here.
        if (!started && !self._speechWorks) { fallback(); return; }
        k++;
        // Beat between sentences — back-to-back utterances run together
        // otherwise. Scaled by rate so slow playback gets roomier pauses.
        self.timer = setTimeout(function () {
          self.timer = null;
          speakNext();
        }, Math.round(340 / (self.rate || 1)));
      };
      u.onend = done;
      u.onerror = function () {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        if (!self._speechWorks) { fallback(); return; }
        k++;
        speakNext();
      };

      try {
        window.speechSynthesis.speak(u);
        // Guard against Chrome's known "utterance never fires onend" hangs.
        watchdog = setTimeout(function () {
          watchdog = null;
          if (!self.playing) return;
          if (!started && !self._speechWorks) { fallback(); return; }
          self.cancelSpeech();
          k++;
          speakNext();
        }, self.estimate(chunks[k]) * 2.5 + 4000);
      } catch (e) {
        fallback();
      }
    };
    speakNext();
  };

  /* English voices, best-sounding first.
     Device voices vary enormously in quality; the cheap built-in ones
     ("compact", "eSpeak", the legacy *Desktop* set) are the robotic ones,
     while network/"natural"/"enhanced" voices sound far better. Rank rather
     than trusting the browser default, which is often the worst installed. */
  ExplainerPlayer.prototype.englishVoices = function () {
    var voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch (e) {}
    var en = voices.filter(function (v) { return /^en\b|^en[-_]/i.test(v.lang || ""); });
    if (!en.length) en = voices.slice();

    function score(v) {
      var s = 0, name = v.name || "";
      if (/espeak|compact|desktop/i.test(name)) s -= 60;
      if (v.localService === false) s += 40;                    // network voices sound best
      if (/natural|neural|premium|enhanced|siri/i.test(name)) s += 45;
      if (/google/i.test(name)) s += 30;
      if (/samantha|ava|allison|aria|jenny|serena|karen|moira|tessa|zira/i.test(name)) s += 22;
      if (/alex|daniel|guy|david|fred|albert|ralph/i.test(name)) s += 8;
      if (/^en-US/i.test(v.lang)) s += 6;
      if (/^en-GB/i.test(v.lang)) s += 4;
      if (v.default) s += 3;
      return s;
    }
    return en.slice().sort(function (a, b) { return score(b) - score(a); });
  };

  ExplainerPlayer.prototype.pickVoice = function () {
    var list = this.englishVoices();
    if (!list.length) return null;                 // not loaded yet — browser default
    if (this._voiceName) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === this._voiceName) return list[i];
      }
    }
    return list[0];
  };

  /* The voice list loads asynchronously in Chrome, so the picker is
     (re)filled whenever it arrives. */
  ExplainerPlayer.prototype.fillVoicePicker = function () {
    if (!this.voiceSel) return;
    var list = this.englishVoices();
    if (!list.length) { this.voiceSel.hidden = true; return; }
    var current = this._voiceName || list[0].name;
    this.voiceSel.hidden = false;
    this.voiceSel.innerHTML = "";
    list.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.name;
      o.textContent = v.name.replace(/\s*\(.*\)$/, "");
      if (v.name === current) o.selected = true;
      this.voiceSel.appendChild(o);
    }, this);
  };

  ExplainerPlayer.prototype.advance = function () {
    if (!this.playing) return;
    if (this.i >= this.scenes.length - 1) {
      this.playing = false;
      this.playBtn.textContent = "▶ Replay";
      this.root.classList.remove("playing");
      this.updateProgress(1);
      this._k = 0; this._elapsed = 0; this._sceneStart = 0;
      return;
    }
    var self = this;
    this._k = 0; this._elapsed = 0; this._sceneStart = 0;
    this.show(this.i + 1);
    // Longer beat at a scene change: the visual switches, and running the
    // next narration straight on makes the two scenes blur together.
    this.stopTimer();
    this.timer = setTimeout(function () {
      self.timer = null;
      self.runScene();
    }, Math.round(700 / (self.rate || 1)));
  };

  document.addEventListener("DOMContentLoaded", function () {
    // Warm up the voice list (async in Chrome)
    if (typeof window.speechSynthesis !== "undefined") {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = function () {};
      } catch (e) {}
    }
    document.querySelectorAll(".explainer").forEach(function (el) {
      new ExplainerPlayer(el);
    });
    // Stop narration if the visitor navigates away
    window.addEventListener("pagehide", function () {
      if (typeof window.speechSynthesis !== "undefined") {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    });
  });
})();
