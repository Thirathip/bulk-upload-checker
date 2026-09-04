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

  console.log('Open the "[Thaimart] : Incident" chat.');
  console.log('Find a message that shows a reply/thread count under it (e.g. "N replies")');
  console.log('and click it so the thread/reply panel opens with replies visible.');
  await waitForEnter('Press ENTER once the thread panel is open and replies are visible... ');

  // Candidates for: (a) the little "N replies" affordance under a message,
  // and (b) the thread/reply detail panel + its message rows once opened.
  const candidates = [
    '[class*="reply"]',
    '[class*="Reply"]',
    '[class*="thread"]',
    '[class*="Thread"]',
    '[class*="comment"]',
    '[class*="Comment"]',
    '[class*="panel"]',
    '[class*="Panel"]',
    '[class*="Sidebar"]',
    '[class*="sidebar"]',
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

  fs.writeFileSync('./inspect-thread-report.json', JSON.stringify(report, null, 2));
  console.log('Wrote inspect-thread-report.json — send this file back so selectors can be calibrated.');

  await browser.close();
})();
