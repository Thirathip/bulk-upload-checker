import { chromium } from 'playwright';
import fs from 'fs';
import readline from 'readline';

const STORAGE_STATE_PATH = './storageState.json';
const START_URL = 'https://lsgnqjtlkjxv.sg.larksuite.com/next/messenger/';

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

(async () => {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    console.error('No storageState.json found. Run: node login.js first.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();
  await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('Open the "[Thaimart] : Incident" chat manually.');
  await waitForEnter('Press ENTER once the chat is open and messages are visible... ');

  // Candidate selectors for a single message row. Lark's web app uses
  // hashed/obfuscated CSS class names, so we probe several patterns and
  // report which ones actually match something.
  const candidates = [
    '[data-message-id]',
    '[class*="message-content"]',
    '[class*="messageContent"]',
    '[class*="chat-message"]',
    '[class*="msg-content"]',
    '[role="listitem"]',
    '[class*="msg-"]',
    '[class*="Message"]',
  ];

  const report = [];
  for (const sel of candidates) {
    const count = await page.locator(sel).count();
    let sample = null;
    if (count > 0) {
      sample = await page.locator(sel).first().evaluate((el) => el.outerHTML.slice(0, 800));
    }
    report.push({ selector: sel, count, sample });
  }

  fs.writeFileSync('./inspect-report.json', JSON.stringify(report, null, 2));
  console.log('Wrote inspect-report.json — send this file back so selectors can be calibrated.');

  await browser.close();
})();
