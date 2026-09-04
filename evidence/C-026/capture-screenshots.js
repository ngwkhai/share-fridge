/**
 * C-026 Verify item #2: viewport screenshots at 390px/430px
 * Run from project root: node evidence/C-026/capture-screenshots.js
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://sharefridge.vercel.app';
const OUT_DIR = join(__dirname, 'screenshots');

mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: '390px', width: 390, height: 844 },
  { name: '430px', width: 430, height: 932 },
];

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Capturing at ${vp.name} (${vp.width}x${vp.height}) ===`);

    // 1. Normal view
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: join(OUT_DIR, `${vp.name}-login.png`),
      fullPage: false,
    });
    await page.screenshot({
      path: join(OUT_DIR, `${vp.name}-login-full.png`),
      fullPage: true,
    });
    console.log('  [ok] login screen');

    // 2. Try to create a test room
    try {
      const inputs = await page.$$('input');
      for (const input of inputs) {
        const placeholder = await input.getAttribute('placeholder');
        if (placeholder && (placeholder.toLowerCase().includes('pin') || placeholder.toLowerCase().includes('passcode'))) {
          await input.fill('9926');
        } else if (placeholder && (placeholder.toLowerCase().includes('tên') || placeholder.toLowerCase().includes('name') || placeholder.toLowerCase().includes('nick'))) {
          await input.fill('Test UI');
        }
      }
      const createBtn = await page.$('button:has-text("Tạo phòng mới")');
      if (createBtn) {
        await createBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({
          path: join(OUT_DIR, `${vp.name}-main-fridge.png`),
          fullPage: false,
        });
        await page.screenshot({
          path: join(OUT_DIR, `${vp.name}-main-fridge-full.png`),
          fullPage: true,
        });
        console.log('  [ok] main fridge view');
      } else {
        console.log('  [skip] no create button found');
      }
    } catch (e) {
      console.log('  [skip] main view: ' + e.message);
    }
    await ctx.close();

    // 3. Reduced motion
    const ctxRM = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 3,
      reducedMotion: 'reduce',
      isMobile: true, hasTouch: true,
    });
    const pageRM = await ctxRM.newPage();
    await pageRM.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await pageRM.waitForTimeout(2000);
    await pageRM.screenshot({
      path: join(OUT_DIR, `${vp.name}-reduced-motion.png`),
      fullPage: false,
    });
    console.log('  [ok] reduced-motion');
    await ctxRM.close();

    // 4. Zoomed (200%)
    const ctxZoom = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 3,
      isMobile: true, hasTouch: true,
    });
    const pageZoom = await ctxZoom.newPage();
    await pageZoom.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await pageZoom.waitForTimeout(1000);
    await pageZoom.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await pageZoom.waitForTimeout(500);
    await pageZoom.screenshot({
      path: join(OUT_DIR, `${vp.name}-zoom-200pct.png`),
      fullPage: true,
    });
    console.log('  [ok] zoom-200%');
    await ctxZoom.close();
  }

  await browser.close();
  console.log('\n=== All screenshots saved ===');
  for (const f of readdirSync(OUT_DIR).sort()) {
    const s = statSync(join(OUT_DIR, f));
    console.log('  ' + f + ' (' + Math.round(s.size / 1024) + 'KB)');
  }
}

captureScreenshots().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
