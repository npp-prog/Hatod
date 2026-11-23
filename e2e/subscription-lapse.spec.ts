import { expect, test } from '@playwright/test';
import { getDoc, patchDoc, phone, resetData, RIDER_LIST, sweepOnce } from './helpers';

test.beforeEach(resetData);

const DAY = 86_400_000;

test('a rider whose subscription lapses is hidden from rider selection', async ({ browser }) => {
  const cust = await phone(browser, '09170000005', '/shops/demo-shop-susan');
  await cust.click('button:has-text("Pork Adobo with rice")');
  await cust.locator('dialog button.btn-primary').click();
  await cust.goto('/checkout');
  await expect(cust.locator(`${RIDER_LIST} > li`, { hasText: 'Ramon' })).toHaveCount(1);

  // Ramon's free trial ended five days ago and he never paid: past the 3-day grace.
  const now = Date.now();
  await patchDoc('subscriptions/rider_demo-rider', {
    trialEndsAt: { integerValue: String(now - 5 * DAY) },
    nextChangeAt: { integerValue: String(now - 1000) },
  });
  sweepOnce();
  expect((await getDoc('subscriptions/rider_demo-rider')).status?.stringValue).toBe('lapsed');

  await cust.reload();
  await expect(cust.locator(`${RIDER_LIST} > li`).first()).toBeVisible();
  await expect(cust.locator(`${RIDER_LIST} > li`, { hasText: 'Ramon' })).toHaveCount(0);

  // Ramon sees why, and cannot go online until he renews.
  const ramon = await phone(browser, '09170000004', '/rider');
  await expect(ramon.getByText('Your plan lapsed. Customers cannot choose you until you renew.')).toBeVisible();
});
