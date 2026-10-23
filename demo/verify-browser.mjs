import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser, previewURL } from "./browser.mjs";

await mkdir("artifacts", { recursive: true });
const browser = await launchBrowser();
try {
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["small-mobile", 320, 720],
    ["wide", 1920, 1080],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(previewURL);
    await page.waitForFunction(() => window.portfolio?.ready);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.title(), "Enter the Robot · ROB 511");
    assert.equal(await page.locator(".score-step").count(), 15);
    await page.evaluate(() => window.portfolio.seek(4));
    assert.equal(await page.locator("#axes svg").count(), 1);
    assert(
      await page.evaluate(() => {
        const title = document.querySelector("h1").getBoundingClientRect();
        const copy = document.querySelector(".dek").getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(document.querySelector("h1"));
        const ink = text.getBoundingClientRect();
        return copy.top >= title.bottom || copy.left >= ink.right;
      }),
      `${label}: title overlaps supporting copy`,
    );
    const first = await page.locator("canvas").screenshot();
    const pixels = await page.evaluate(() => window.portfolio.pixelSummary());
    assert(
      pixels.yellow > 400 && pixels.dark > 300,
      `${label}: blank or missing robot`,
    );
    await page.evaluate(() => window.portfolio.seek(11));
    const second = await page.locator("canvas").screenshot();
    assert(!first.equals(second), `${label}: robot does not move`);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${label}: horizontal overflow`,
    );
    await page
      .getByRole("button", { name: "Show joint frames", exact: true })
      .click();
    assert.equal(
      await page.locator("#axes").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#axes").click();
    await page
      .getByRole("button", { name: "Reset camera", exact: true })
      .click();
    await page.locator('[data-state="bow"]').click();
    assert.equal(await page.locator("#state-label").textContent(), "Respect");
    assert.equal(await page.locator("#state-index").textContent(), "14 / 15");
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.portfolio.seek(4);
    });
    await page.screenshot({ path: `artifacts/${label}.png`, fullPage: true });
    const video = await page.locator("video").evaluate(async (element) => {
      element.load();
      await new Promise((resolve, reject) => {
        element.onloadedmetadata = resolve;
        element.onerror = reject;
      });
      return {
        width: element.videoWidth,
        height: element.videoHeight,
        duration: element.duration,
      };
    });
    assert.equal(video.width, 1280);
    assert(video.duration >= 20 && video.duration <= 25);
    assert.deepEqual(errors, []);
    console.log(
      `${label}: rendered, moving, controls working, video ${video.width}x${video.height}, no overflow.`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
