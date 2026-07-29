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

    this.scenes.forEach(function (s, i) {
      s.dataset.index = i;
      // Pre-split narration into sentence chunks
      var text = (s.dataset.narration || "").trim();
      s._chunks = text ? text.match(/[^.!?]+[.!?]*/g).map(function (t) { return t.trim(); }).filter(Boolean) : [];
    });

    this.buildUI();
    this.show(0);
  }

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
    this.root.insertBefore(chips, bar.nextSibling);
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
    this.runScene();
  };

  ExplainerPlayer.prototype.pause = function () {
    this.playing = false;
    this.playBtn.textContent = "▶ Resume";
    this.root.classList.remove("playing");
    this.stopTimer();
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

  /* Estimate reading time when there's no voice: ~2.6 words/second. */
  ExplainerPlayer.prototype.estimate = function (text) {
    var words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(2200, (words / 2.6) * 1000 + 500);
  };

  ExplainerPlayer.prototype.runScene = function () {
    if (!this.playing) return;
    var self = this;
    var scene = this.scenes[this.i];

    // Restart CSS animations for this scene
    scene.classList.remove("active");
    void scene.offsetWidth;
    scene.classList.add("active");

    var chunks = scene._chunks;
    var useVoice = this.speechAvailable() && !this.muted && !this._speechBroken && chunks.length;

    if (!useVoice) {
      var ms = this.estimate(scene.dataset.narration || "");
      var start = Date.now();
      var tick = function () {
        if (!self.playing) return;
        var f = Math.min(1, (Date.now() - start) / ms);
        self.updateProgress(f);
        if (f < 1) self.timer = setTimeout(tick, 100);
        else self.advance();
      };
      tick();
      return;
    }

    // Speak sentence chunks in sequence (avoids Chrome's long-utterance cutoff)
    this.cancelSpeech();
    var k = 0;
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
      if (k >= chunks.length) { self.advance(); return; }
      self.updateProgress(k / chunks.length);

      var u = new SpeechSynthesisUtterance(chunks[k]);
      u.rate = 1.0;
      u.pitch = 1.0;
      var v = self.pickVoice();
      if (v) u.voice = v;

      var started = false;
      u.onstart = function () { started = true; self._speechWorks = true; };

      var done = function () {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        // Never started and no prior successful speech => synthesis is a no-op here.
        if (!started && !self._speechWorks) { fallback(); return; }
        k++;
        speakNext();
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

  ExplainerPlayer.prototype.pickVoice = function () {
    if (this._voice !== undefined) return this._voice;
    var voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!voices.length) return null;   // not loaded yet; browser default is fine
    var preferred = ["Samantha", "Google US English", "Microsoft Aria", "Microsoft Zira", "Alex", "Daniel"];
    for (var i = 0; i < preferred.length; i++) {
      for (var j = 0; j < voices.length; j++) {
        if (voices[j].name.indexOf(preferred[i]) !== -1) { this._voice = voices[j]; return this._voice; }
      }
    }
    for (var m = 0; m < voices.length; m++) {
      if (/^en[-_]/i.test(voices[m].lang)) { this._voice = voices[m]; return this._voice; }
    }
    this._voice = null;
    return null;
  };

  ExplainerPlayer.prototype.advance = function () {
    if (!this.playing) return;
    if (this.i >= this.scenes.length - 1) {
      this.playing = false;
      this.playBtn.textContent = "▶ Replay";
      this.root.classList.remove("playing");
      this.updateProgress(1);
      return;
    }
    this.show(this.i + 1);
    this.runScene();
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
