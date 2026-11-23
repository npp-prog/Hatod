import { expect, test } from '@playwright/test';
import { phone, placeOrder, resetData } from './helpers';

test.beforeEach(resetData);

test('rider declines, customer picks another rider who accepts', async ({ browser }) => {
  const shop = await phone(browser, '09170000003', '/shop/orders');
  const ramon = await phone(browser, '09170000004', '/rider/jobs');
  const jojo = await phone(browser, '09170000021', '/rider/jobs');
  const cust = await phone(browser, '09170000005');

  await placeOrder(cust, 'Ramon');
  await expect(shop.getByText('New orders (1)')).toBeVisible();
  await shop.locator('article').first().getByRole('button', { name: '15 min' }).click();

  await expect(ramon.getByText('New job')).toBeVisible();
  await ramon.getByRole('button', { name: 'Decline' }).click();

  // Customer gets a refreshed list without Ramon and chooses Jojo.
  const another = cust.locator('section[aria-labelledby=another-title]');
  await expect(another).toBeVisible();
  await expect(another.locator('li', { hasText: 'Ramon' })).toHaveCount(0);
  await another.locator('li', { hasText: 'Jojo' }).getByRole('button', { name: 'Choose' }).click();

  await expect(jojo.getByText('New job')).toBeVisible();
  await jojo.getByRole('button', { name: 'Accept job' }).click();
  await expect(jojo.getByText('Current job')).toBeVisible();
  await expect(cust.getByText('Rider assigned').first()).toBeVisible();
  await expect(shop.getByText('Rider: Jojo')).toBeVisible();
  await expect(ramon.getByText('New job')).toHaveCount(0);
});
