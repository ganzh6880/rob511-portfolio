import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchBrowser, previewURL } from "./browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await launchBrowser();
let encoder;
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${previewURL}?capture=1`);
  await page.waitForFunction(() => window.portfolio?.ready);
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.portfolio.duration);
  encoder = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      "30",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(root, "public/project3/enter-the-robot.mp4"),
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let log = "";
  encoder.stderr.on("data", (data) => {
    log += data;
  });
  const closed = once(encoder, "close");
  for (let i = 0; i <= Math.ceil(duration * 30); i++) {
    await page.evaluate(
      (t) => window.portfolio.seek(t),
      Math.min(i / 30, duration),
    );
    const frame = await page.screenshot({ type: "jpeg", quality: 90 });
    if (!encoder.stdin.write(frame)) await once(encoder.stdin, "drain");
    if (i % 150 === 0)
      console.log(`Rendered ${i}/${Math.ceil(duration * 30)} video frames`);
  }
  encoder.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw Error(log);
  if (errors.length) throw Error(errors.join("\n"));
  const recording = JSON.parse(
    await readFile(path.join(root, "public/project3/recording.json"), "utf8"),
  );
  const strike = recording.events.findIndex(
    (event) => event.state === "strike",
  );
  const posterTime =
    (recording.events[strike].t + recording.events[strike + 1].t) / 2;
  await page.evaluate((time) => window.portfolio.seek(time), posterTime);
  await page.screenshot({
    path: path.join(root, "public/project3/poster.jpg"),
    type: "jpeg",
    quality: 92,
  });
  console.log(
    `Saved 1280x720, 30 fps film (${duration.toFixed(2)}s) and poster.`,
  );
} finally {
  encoder?.kill();
  await browser.close();
}
