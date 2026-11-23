import { execSync } from 'node:child_process';
import path from 'node:path';
import { devices, type Browser, type Page } from '@playwright/test';

export const PROJECT = 'demo-hatod';
const ROOT = path.resolve(__dirname, '..');
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Wipes Firestore, re-seeds the demo town, and keeps Susan's Kitchen open around the clock. */
export async function resetData() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  execSync('npm run seed', { cwd: ROOT, stdio: 'pipe' });
  const allDay = { arrayValue: { values: [{ mapValue: { fields: { open: { stringValue: '00:00' }, close: { stringValue: '24:00' } } } }] } };
  const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, allDay]));
  await patchDoc('shops/demo-shop-susan', { hours: { mapValue: { fields: days } } });
}

/** Writes raw Firestore REST fields as the emulator owner, bypassing rules. */
export async function patchDoc(docPath: string, fields: Record<string, unknown>) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${FS}/${docPath}?${mask}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`patch ${docPath} failed: ${await r.text()}`);
}

export async function getDoc(docPath: string): Promise<Record<string, any>> {
  const r = await fetch(`${FS}/${docPath}`, { headers: OWNER });
  return ((await r.json()) as { fields?: Record<string, any> }).fields ?? {};
}

/** Runs the order and subscription sweeps once (the emulator does not run scheduled functions). */
export function sweepOnce() {
  execSync('npx tsx scripts/sweep-dev.ts --once', { cwd: ROOT, stdio: 'pipe' });
}

async function otpCode(e164: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/verificationCodes`);
    const codes = ((await r.json()) as { verificationCodes?: { phoneNumber: string; code: string }[] }).verificationCodes ?? [];
    const hit = codes.filter((c) => c.phoneNumber === e164).pop();
    if (hit) return hit.code;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no OTP for ${e164}`);
}

/** Opens a new phone (browser context), signs in with a demo number like "09170000005", then goes to `to`. */
export async function phone(browser: Browser, local: string, to?: string): Promise<Page> {
  const ctx = await browser.newContext({ ...devices['Pixel 5'], baseURL: 'http://localhost:3000' });
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${local}] page error:`, e.message));
  await page.goto('/auth');
  await page.fill('#phone', local);
  await page.click('button[type=submit]');
  await page.waitForSelector('#code');
  await page.fill('#code', await otpCode('+63' + local.slice(1)));
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('/auth'));
  if (to) await page.goto(to);
  return page;
}

export const RIDER_LIST = 'ul[aria-label="Choose your rider"]';

/** Customer on Susan's page: adds two items, goes to checkout, picks `rider`, pays cash and places the order. */
export async function placeOrder(cust: Page, rider: string) {
  await cust.goto('/shops/demo-shop-susan');
  await cust.click('button:has-text("Tapsilog")');
  await cust.locator('dialog label', { hasText: 'Regular' }).click();
  await cust.locator('dialog button.btn-primary').click();
  await cust.click('button:has-text("Pork Adobo with rice")');
  await cust.locator('dialog button.btn-primary').click();
  await cust.goto('/checkout');
  await cust.locator(`${RIDER_LIST} > li`, { hasText: rider }).locator('input').check();
  await cust.locator('label.chip').getByText('Cash', { exact: true }).click();
  await cust.getByRole('button', { name: /Place order/ }).click();
  await cust.waitForURL(/\/orders\//);
}
