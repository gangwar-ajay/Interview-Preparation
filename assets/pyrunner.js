/* In-browser Python powered by Pyodide (CPython on WebAssembly).
   - Adds a "Run" button + output console under every <pre><code> block.
   - Packages (numpy, pandas, matplotlib, …) are fetched on demand from
     the import statements in the code.
   - matplotlib figures are captured and returned as base64 PNGs.
   - stdin can be supplied so input() works (playground's Input panel).
   - Blocks importing torch/transformers/tensorflow get an Open-in-Colab
     link instead: those frameworks have no WebAssembly build.
   Exposes window.PyRunner = { execute, encodeShare, decodeShare }. */

var PyRunner = (function () {
  var CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  var loadPromise = null;

  function ensure(status) {
    if (!loadPromise) {
      if (status) status("Loading Python runtime (~12 MB, first time only)…");
      loadPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = CDN + "pyodide.js";
        s.onload = resolve;
        s.onerror = function () {
          loadPromise = null;
          reject(new Error("Could not load the Python runtime — check your internet connection and try again."));
        };
        document.head.appendChild(s);
      }).then(function () {
        return loadPyodide({ indexURL: CDN });
      });
    }
    return loadPromise;
  }

  var MPL_COLLECT = [
    "import base64 as _b64, io as _io",
    "import matplotlib.pyplot as _plt",
    "_imgs = []",
    "for _n in _plt.get_fignums():",
    "    _buf = _io.BytesIO()",
    "    _plt.figure(_n).savefig(_buf, format='png', dpi=110, bbox_inches='tight')",
    "    _imgs.append(_b64.b64encode(_buf.getvalue()).decode())",
    "_plt.close('all')",
    "_imgs"
  ].join("\n");

  /* Run code; returns a list of base64 PNGs from matplotlib figures.
     opts.stdin: string fed line-by-line to input() (EOF when exhausted). */
  async function execute(code, onLine, status, opts) {
    var py = await ensure(status);
    if (status) status("Fetching packages…");
    await py.loadPackagesFromImports(code);
    py.setStdout({ batched: onLine });
    py.setStderr({ batched: onLine });
    if (opts && typeof opts.stdin === "string") {
      var lines = opts.stdin.length ? opts.stdin.split("\n") : [];
      var li = 0;
      py.setStdin({ stdin: function () { return li < lines.length ? lines[li++] : null; } });
    }
    var hasMpl = /(^|\n)\s*(import|from)\s+matplotlib\b/.test(code);
    if (hasMpl) await py.runPythonAsync("import matplotlib\nmatplotlib.use('Agg')");
    if (status) status("Running…");
    var result = await py.runPythonAsync(code);
    if (result !== undefined && result !== null) onLine(String(result));
    var images = [];
    if (hasMpl) {
      var proxy = await py.runPythonAsync(MPL_COLLECT);
      if (proxy && proxy.toJs) { images = proxy.toJs(); proxy.destroy(); }
    }
    return images;
  }

  /* Share-link helpers: UTF-8 safe base64 for URL fragments. */
  function encodeShare(text) {
    var bytes = new TextEncoder().encode(text), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeShare(b64) {
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  return { execute: execute, encodeShare: encodeShare, decodeShare: decodeShare };
})();

document.addEventListener("DOMContentLoaded", function () {
  var UNRUNNABLE = /(^|\n)\s*(import|from)\s+(torch|transformers|tensorflow)\b/;
  var pgBase = location.pathname.indexOf("/questions/") !== -1 ? "../" : "";

  document.querySelectorAll("pre > code").forEach(function (codeEl) {
    var pre = codeEl.parentElement;
    if (pre.classList.contains("no-run") || pre.classList.contains("py-out")) return;
    var code = codeEl.textContent;

    var row = document.createElement("div");
    row.className = "run-row";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "run-btn";
    var out = document.createElement("pre");
    out.className = "py-out";
    out.hidden = true;
    var plots = document.createElement("div");
    plots.className = "py-plots";

    if (UNRUNNABLE.test(code)) {
      btn.disabled = true;
      btn.textContent = "Needs PyTorch — can't run in browser";
      btn.title = "PyTorch has no browser (WebAssembly) build, so this snippet can't run here.";
      if (pre.dataset.colab) {
        var a = document.createElement("a");
        a.className = "colab-link";
        a.href = "https://colab.research.google.com/github/gangwar-ajay/Interview-Preparation/blob/main/notebooks/" +
          pre.dataset.colab + ".ipynb";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Open in Google Colab ↗";
        a.title = "Runs this snippet as a notebook on Colab's free GPUs (PyTorch preinstalled).";
        row.appendChild(a);
      }
    } else {
      btn.textContent = "▶ Run";
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        out.hidden = false;
        out.textContent = "";
        plots.innerHTML = "";
        var lines = [];
        function print(t) { lines.push(t); out.textContent = lines.join("\n"); }
        try {
          var images = await PyRunner.execute(code, print, function (st) { btn.textContent = st; });
          if (!lines.length && !images.length) print("(no output — use print() to see results)");
          images.forEach(function (b64) {
            var img = document.createElement("img");
            img.src = "data:image/png;base64," + b64;
            img.alt = "matplotlib figure";
            plots.appendChild(img);
          });
        } catch (e) {
          print(String((e && e.message) || e));
        }
        btn.textContent = "▶ Run again";
        btn.disabled = false;
      });

      var open = document.createElement("a");
      open.className = "pg-open";
      open.href = pgBase + "playground.html#code=" + PyRunner.encodeShare(code);
      open.textContent = "Open in Playground ↗";
      open.title = "Edit and run this snippet in the Python Playground.";
      row.appendChild(open);
    }

    row.insertBefore(btn, row.firstChild);
    pre.insertAdjacentElement("afterend", plots);
    pre.insertAdjacentElement("afterend", out);
    pre.insertAdjacentElement("afterend", row);
  });
});
