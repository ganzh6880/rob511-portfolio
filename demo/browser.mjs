import { chromium } from "@playwright/test";
export const previewURL = process.env.PORTFOLIO_URL ?? "http://127.0.0.1:5173/";
export function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
}
