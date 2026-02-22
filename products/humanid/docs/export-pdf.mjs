#!/usr/bin/env node
/**
 * Export presentation.html to PDF — one slide per page.
 * Usage: node export-pdf.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '../../command-center/apps/api');
const require = createRequire(path.join(apiDir, 'index.js'));
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const INPUT = path.join(__dirname, 'presentation.html');
const OUTPUT = path.join(__dirname, 'HumanID-Presentation.pdf');

async function main() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('Loading presentation...');
  await page.goto(`file://${INPUT}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Get total slide count
  const totalSlides = await page.evaluate(() =>
    document.querySelectorAll('.slide[data-slide]').length
  );
  console.log(`Found ${totalSlides} slides`);

  // Inject print styles: show all slides stacked, each exactly one page
  await page.evaluate(() => {
    // Remove nav elements
    document.getElementById('nav')?.remove();
    document.getElementById('prev-btn')?.remove();
    document.getElementById('next-btn')?.remove();
    document.getElementById('slide-counter')?.remove();
    document.getElementById('progress-bar')?.remove();

    const style = document.createElement('style');
    style.textContent = `
      body {
        overflow: visible !important;
        height: auto !important;
      }
      .slides {
        position: relative !important;
        height: auto !important;
      }
      .slide {
        position: relative !important;
        opacity: 1 !important;
        transform: none !important;
        pointer-events: all !important;
        width: 100% !important;
        height: 100vh !important;
        page-break-after: always !important;
        break-after: page !important;
        display: flex !important;
      }
      .slide:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      /* Fix: background-clip:text renders as solid block in PDF */
      h1.hero-title {
        background: none !important;
        -webkit-background-clip: unset !important;
        background-clip: unset !important;
        -webkit-text-fill-color: #fff !important;
        color: #fff !important;
      }
    `;
    document.head.appendChild(style);
  });

  await new Promise(r => setTimeout(r, 500));

  console.log('Generating PDF...');
  await page.pdf({
    path: OUTPUT,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false,
  });

  await browser.close();
  console.log(`PDF saved to: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
