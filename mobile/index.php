<?php
/*
 * Filename: index.php
 * Revision: 1.1.0
 * Description: Visible mobile preview utility page with phone and tablet viewport presets.
 * Modified Date: 2026-07-17 8:06 AM ET
 */
declare(strict_types=1);
require_once __DIR__ . '/../api/lib/Auth.php';
if (current_auth_user() === null) {
    header('Location: ../', true, 302);
    exit;
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>HumidorHQ Mobile Preview</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #17120f;
        --panel: #241b16;
        --text: #f4eadc;
        --muted: #bda996;
        --line: #4b382b;
        --accent: #f2b66d;
        --accent-soft: rgba(242, 182, 109, 0.14);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        background: var(--bg);
        color: var(--text);
        margin: 0;
        min-height: 100vh;
      }
      .shell {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
        min-height: 100vh;
        padding: 18px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
      }
      h1, h2, p { margin-top: 0; }
      h1 { color: var(--accent); font-size: 1.55rem; line-height: 1.1; margin-bottom: 8px; }
      h2 { font-size: 1rem; margin-bottom: 12px; }
      .muted { color: var(--muted); font-size: 0.9rem; line-height: 1.45; }
      .controls, .link-grid { display: grid; gap: 10px; margin-top: 16px; }
      a, button, select { border-radius: 6px; font: inherit; }
      .utility-link, button {
        background: #17100d;
        border: 1px solid var(--line);
        color: var(--text);
        cursor: pointer;
        display: block;
        padding: 10px 12px;
        text-align: left;
        text-decoration: none;
      }
      .utility-link:hover, button:hover {
        background: var(--accent-soft);
        border-color: rgba(242, 182, 109, 0.5);
        color: var(--accent);
      }
      label { color: var(--muted); display: grid; gap: 6px; font-size: 0.84rem; }
      select {
        background: #17100d;
        border: 1px solid var(--line);
        color: var(--text);
        min-height: 38px;
        padding: 8px 10px;
      }
      .preview-wrap {
        align-items: start;
        display: grid;
        justify-content: center;
        overflow: auto;
      }
      .device-frame {
        background: #060404;
        border: 1px solid #5c4638;
        border-radius: 28px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
        padding: 14px;
      }
      iframe {
        background: var(--bg);
        border: 0;
        border-radius: 18px;
        display: block;
        height: 874px;
        width: 402px;
      }
      .size-readout { color: var(--muted); font-size: 0.82rem; margin: 10px 0 0; text-align: center; }
      @media (max-width: 900px) {
        .shell { grid-template-columns: 1fr; padding: 14px; }
        iframe { max-width: calc(100vw - 64px); }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel">
        <h1>Mobile Preview</h1>
        <p class="muted">Check HumidorHQ at common phone and tablet widths.</p>
        <div class="link-grid">
          <a class="utility-link" href="../#Dashboard">Back to HumidorHQ</a>
        </div>
        <h2>Preview</h2>
        <div class="controls">
          <label>
            Preview mode
            <select id="device-select">
              <option value="402x874">iPhone 16 Pro - 402 x 874</option>
              <option value="440x956">iPhone 16 Pro Max - 440 x 956</option>
              <option value="393x852">iPhone 15 Pro - 393 x 852</option>
              <option value="390x844">iPhone 13/14 - 390 x 844</option>
              <option value="768x1024">iPad Portrait - 768 x 1024</option>
            </select>
          </label>
          <button id="apply-size" type="button">Apply selected view</button>
          <button id="reload-preview" type="button">Reload preview</button>
        </div>
      </section>

      <section class="panel preview-wrap" aria-label="Site viewport preview">
        <div>
          <div class="device-frame" id="device-frame">
            <iframe id="site-preview" src="../#Dashboard" title="HumidorHQ site preview"></iframe>
          </div>
          <p class="size-readout" id="size-readout">iPhone 16 Pro - 402 x 874</p>
        </div>
      </section>
    </main>

    <script>
      const select = document.querySelector('#device-select')
      const preview = document.querySelector('#site-preview')
      const readout = document.querySelector('#size-readout')

      function applySelectedSize() {
        const [width, height] = select.value.split('x').map(Number)
        preview.style.width = `${width}px`
        preview.style.height = `${height}px`
        readout.textContent = select.options[select.selectedIndex].textContent
      }

      document.querySelector('#apply-size').addEventListener('click', applySelectedSize)
      document.querySelector('#reload-preview').addEventListener('click', () => {
        preview.contentWindow.location.reload()
      })
      select.addEventListener('change', applySelectedSize)
      applySelectedSize()
    </script>
  </body>
</html>
