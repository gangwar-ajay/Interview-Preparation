/* In-browser Python powered by Pyodide (CPython on WebAssembly).
   - Adds a "Run" button + output console under every <pre><code> block.
   - Packages (numpy, pandas, scipy, …) are fetched on demand from the
     import statements in the code.
   - Blocks importing torch/transformers/tensorflow get a "run locally"
     badge instead: those frameworks have no WebAssembly build.
   Exposes window.PyRunner = { execute } for the playground page. */

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

  async function execute(code, onLine, status) {
    var py = await ensure(status);
    if (status) status("Fetching packages…");
    await py.loadPackagesFromImports(code);
    py.setStdout({ batched: onLine });
    py.setStderr({ batched: onLine });
    if (status) status("Running…");
    var result = await py.runPythonAsync(code);
    if (result !== undefined && result !== null) onLine(String(result));
  }

  return { execute: execute };
})();

document.addEventListener("DOMContentLoaded", function () {
  var UNRUNNABLE = /(^|\n)\s*(import|from)\s+(torch|transformers|tensorflow)\b/;

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

    if (UNRUNNABLE.test(code)) {
      btn.disabled = true;
      btn.textContent = "PyTorch required — copy & run locally";
      btn.title = "PyTorch has no browser (WebAssembly) build, so this snippet can't run here.";
    } else {
      btn.textContent = "▶ Run";
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        out.hidden = false;
        out.textContent = "";
        var lines = [];
        function print(t) { lines.push(t); out.textContent = lines.join("\n"); }
        try {
          await PyRunner.execute(code, print, function (st) { btn.textContent = st; });
          if (!lines.length) print("(no output — use print() to see results)");
        } catch (e) {
          print(String((e && e.message) || e));
        }
        btn.textContent = "▶ Run again";
        btn.disabled = false;
      });
    }

    row.appendChild(btn);
    pre.insertAdjacentElement("afterend", out);
    pre.insertAdjacentElement("afterend", row);
  });
});
