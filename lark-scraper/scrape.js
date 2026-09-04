import { chromium } from 'playwright';
import fs from 'fs';
import readline from 'readline';

const STORAGE_STATE_PATH = './storageState.json';
const START_URL = 'https://lsgnqjtlkjxv.sg.larksuite.com/next/messenger/';
const OUTPUT_PATH = './messages.json';

// Calibrated via inspect-report.json — [class*="message-content"] matched
// one element per message row; data-message-id is not present on this page.
const MESSAGE_ROW_SELECTOR = '[class*="message-content"]';

const MAX_SCROLL_ROUNDS = 300;
const SCROLL_PAUSE_MS = 600;
const STABLE_ROUNDS_TO_STOP = 5;

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

  // Find the scrollable message-list container by walking up from the
  // first message row until we hit an element that actually scrolls. Some
  // rows sit inside a small inner scroller (e.g. a truncated-text wrapper),
  // so keep walking and keep the OUTERMOST scrollable ancestor found — that
  // is the real message-list viewport, not a per-message text clamp.
  const containerHandle = await page.evaluateHandle((rowSel) => {
    const row = document.querySelector(rowSel);
    if (!row) return null;
    let el = row.parentElement;
    let found = null;
    while (el) {
      const style = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(style.overflowY)) {
        found = el;
      }
      el = el.parentElement;
    }
    return found;
  }, MESSAGE_ROW_SELECTOR);

  const container = containerHandle.asElement();
  if (!container) {
    console.error(
      'Could not find a scrollable message container.\n' +
        'Run `node inspect.js` first and update MESSAGE_ROW_SELECTOR in scrape.js.'
    );
    await browser.close();
    process.exit(1);
  }

  const containerInfo = await container.evaluate((el) => ({
    className: el.className,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  console.log('Using scroll container:', containerInfo);

  // Lark virtualizes the message list: only the on-screen rows exist in the
  // DOM at any moment, so the element count never grows as you scroll up —
  // older rows get recycled away as soon as newer-than-view ones scroll out.
  // We must snapshot the currently-rendered rows on every round and
  // accumulate unique messages (keyed by id, else by text) as we go.
  const seen = new Map();

  async function collectVisible() {
    const rows = await page.locator(MESSAGE_ROW_SELECTOR).evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-message-id') || null,
        text: el.innerText.trim(),
      }))
    );
    for (const row of rows) {
      if (!row.text) continue;
      const key = row.id || row.text;
      if (!seen.has(key)) seen.set(key, row);
    }
  }

  console.log('Scrolling up to load history...');
  await collectVisible();

  // Use real wheel input (via CDP), not a direct scrollTop assignment.
  // Lark's loader only fires its "fetch older messages" logic off of
  // genuine scroll/wheel interaction; once scrollTop is programmatically
  // pinned at 0 there is no further delta to re-trigger it on later
  // iterations, so a plain `el.scrollTop = 0` loop stalls after round 0.
  const box = await container.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  let lastSize = -1;
  let stableRounds = 0;

  for (let i = 0; i < MAX_SCROLL_ROUNDS; i++) {
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(SCROLL_PAUSE_MS);
    await collectVisible();

    if (seen.size === lastSize) {
      stableRounds++;
      if (stableRounds >= STABLE_ROUNDS_TO_STOP) {
        console.log(`No new unique messages after ${STABLE_ROUNDS_TO_STOP} rounds — assuming top of history reached.`);
        break;
      }
    } else {
      stableRounds = 0;
    }
    lastSize = seen.size;
    if (i % 10 === 0) console.log(`  round ${i}: ${seen.size} unique messages collected so far`);
  }

  const messages = Array.from(seen.values());
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(messages, null, 2));
  console.log(`Saved ${messages.length} messages to ${OUTPUT_PATH}`);

  await browser.close();
})();
