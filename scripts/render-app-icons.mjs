// Renders every iOS and Android app icon + splash screen straight into the
// native projects, using headless Chromium (no sharp/libvips needed).
//
//   node scripts/render-app-icons.mjs
//
// Icons: white TekScribe mark on the brand-blue tile.
// Adaptive foregrounds (Android): mark scaled into the safe zone on the same
// blue, paired with the ic_launcher_background color (#1D4ED8).
// Splashes: blue mark centered on the app background (#f6f8fb).

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const executablePath = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium";

const BRAND = "#1d4ed8";
const BG = "#f6f8fb";

// The clipboard-with-heartbeat mark from components/Logo.tsx, tuned for icon
// weight: no clip hole, and the pulse spike stops short of the clip so the
// shapes stay distinct at thick stroke widths. The board (main square) is
// centered on the viewBox center (50,50), so it sits dead-center in the tile;
// the clip protrudes above it.
const mark = (size, stroke) => `
  <svg width="${size}" height="${size}" viewBox="17 17 66 66" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M40 25 H33 Q24 25 24 34 V66 Q24 75 33 75 H67 Q76 75 76 66 V34 Q76 25 67 25 H60" />
      <rect x="40" y="18" width="20" height="11" rx="4" />
      <polyline points="26,53 36,53 40,49 43,53 47,53 48,59 51,37 53,65 56,53 60,53 64,49 67,53 74,53" />
    </g>
  </svg>`;

const tile = (w, h, bg, markPx, stroke) => `<!doctype html><html><body style="margin:0">
  <div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center">
    ${mark(markPx, stroke)}
  </div></body></html>`;

// [path, width, height, background, markScale (of min dimension), stroke]
const ICON = (px) => [`icon`, px, px, BRAND, 0.72, "#ffffff"];
const FG = (px) => [`fg`, px, px, BRAND, 0.45, "#ffffff"]; // adaptive safe zone
const SPLASH = (w, h) => [`splash`, w, h, BG, 0.2, BRAND];

const jobs = [
  // Android launcher icons (square + round use the same art; the OS masks it)
  ...[
    ["mdpi", 48],
    ["hdpi", 72],
    ["xhdpi", 96],
    ["xxhdpi", 144],
    ["xxxhdpi", 192],
  ].flatMap(([dpi, px]) => [
    [`android/app/src/main/res/mipmap-${dpi}/ic_launcher.png`, ...ICON(px).slice(1)],
    [`android/app/src/main/res/mipmap-${dpi}/ic_launcher_round.png`, ...ICON(px).slice(1)],
  ]),
  // Android adaptive foregrounds
  ...[
    ["mdpi", 108],
    ["hdpi", 162],
    ["xhdpi", 216],
    ["xxhdpi", 324],
    ["xxxhdpi", 432],
  ].map(([dpi, px]) => [
    `android/app/src/main/res/mipmap-${dpi}/ic_launcher_foreground.png`,
    ...FG(px).slice(1),
  ]),
  // Android splash screens
  ...[
    ["drawable", 480, 320],
    ["drawable-land-mdpi", 480, 320],
    ["drawable-land-hdpi", 800, 480],
    ["drawable-land-xhdpi", 1280, 720],
    ["drawable-land-xxhdpi", 1600, 960],
    ["drawable-land-xxxhdpi", 1920, 1280],
    ["drawable-port-mdpi", 320, 480],
    ["drawable-port-hdpi", 480, 800],
    ["drawable-port-xhdpi", 720, 1280],
    ["drawable-port-xxhdpi", 960, 1600],
    ["drawable-port-xxxhdpi", 1280, 1920],
  ].map(([dir, w, h]) => [
    `android/app/src/main/res/${dir}/splash.png`,
    ...SPLASH(w, h).slice(1),
  ]),
  // iOS icon + splashes
  [
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    ...ICON(1024).slice(1),
  ],
  ...["", "-1", "-2"].map((suffix) => [
    `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732${suffix}.png`,
    ...SPLASH(2732, 2732).slice(1),
  ]),
  // Source masters, for regenerating with other tools later
  ["resources/icon.png", ...ICON(1024).slice(1)],
  ["resources/splash.png", ...SPLASH(2732, 2732).slice(1)],
];

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [path, w, h, bg, scale, stroke] of jobs) {
  mkdirSync(dirname(path), { recursive: true });
  const markPx = Math.round(Math.min(w, h) * scale);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(tile(w, h, bg, markPx, stroke));
  await page.screenshot({ path });
  console.log(`wrote ${path} (${w}x${h})`);
}

await browser.close();
console.log(`\nDone: ${jobs.length} images.`);
