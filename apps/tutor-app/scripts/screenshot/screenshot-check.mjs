import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:6173/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: 'live2d-position-check.png', fullPage: false });
console.log('Screenshot saved to live2d-position-check.png');
await browser.close();
