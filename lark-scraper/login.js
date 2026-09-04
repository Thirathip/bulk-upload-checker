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
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(START_URL);

  console.log('Browser opened. Log in manually (QR / password / SSO).');
  await waitForEnter('Press ENTER here once you are fully logged in and can see the chat list... ');

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);

  await browser.close();
})();
