// Print HTML files to PDF with Playwright's Chromium.
// Usage: node learn/pdf.cjs <in.html> <out.pdf> [<in.html> <out.pdf> ...]
// Requires the `playwright` package (resolvable via NODE_PATH or a local install).
"use strict";

const path = require("path");

async function main(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) {
    console.error("usage: node pdf.cjs <in.html> <out.pdf> [...]");
    return 2;
  }
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (err) {
    console.error("[pdf] cannot load playwright: " + err.message + "\nInstall it with `npm i -g playwright` and set NODE_PATH=$(npm root -g).");
    return 1;
  }
  const launchOpts = {};
  if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);
  try {
    for (let i = 0; i < argv.length; i += 2) {
      const src = path.resolve(argv[i]);
      const out = path.resolve(argv[i + 1]);
      const page = await browser.newPage();
      await page.goto("file://" + src, { waitUntil: "load", timeout: 120000 });
      await page.pdf({
        path: out,
        format: "Letter",
        printBackground: true,
        margin: { top: "0.7in", bottom: "0.7in", left: "0.75in", right: "0.75in" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666;font-family:Georgia,serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      });
      await page.close();
      console.log("[pdf] wrote " + out);
    }
  } finally {
    await browser.close();
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => { console.error("[pdf] failed: " + (err && err.stack || err)); process.exit(1); }
);
