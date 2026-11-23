import { expect, test } from '@playwright/test';
import { phone, placeOrder, resetData } from './helpers';

test.beforeEach(resetData);

test('customer order goes from placed to completed', async ({ browser }) => {
  const shop = await phone(browser, '09170000003', '/shop/orders');
  const rider = await phone(browser, '09170000004', '/rider/jobs');
  const cust = await phone(browser, '09170000005');
  await expect(rider.getByText('Waiting for job offers')).toBeVisible();

  await placeOrder(cust, 'Ramon');
  await expect(cust.getByText('Waiting for the shop')).toBeVisible();

  // Shop accepts with a ready time; the offer goes to Ramon.
  await expect(shop.getByText('New orders (1)')).toBeVisible();
  await shop.locator('article').first().getByRole('button', { name: '15 min' }).click();
  await expect(cust.getByText('Asking your rider')).toBeVisible();

  await expect(rider.getByText('New job')).toBeVisible();
  await rider.getByRole('button', { name: 'Accept job' }).click();
  await expect(rider.getByText('Current job')).toBeVisible();
  await expect(cust.getByText('Rider assigned').first()).toBeVisible();
  await expect(shop.getByText('Rider: Ramon')).toBeVisible();

  // Ready, picked up, delivered, both parties mark their own payment.
  await shop.getByRole('button', { name: 'Food is ready' }).click();
  await expect(rider.getByText('Food is ready')).toBeVisible();
  await rider.getByRole('button', { name: 'I picked up the order' }).click();
  await expect(cust.getByText('On the way')).toBeVisible();
  await rider.getByRole('button', { name: 'I delivered the order' }).click();
  await rider.getByRole('button', { name: 'I collected my fee' }).click();
  await shop.getByRole('button', { name: 'Food paid' }).click();
  await expect(cust.getByText('Rider marked delivery as paid')).toBeVisible();

  await cust.getByRole('button', { name: 'I received my order' }).click();
  await expect(cust.getByRole('button', { name: 'Order again' })).toBeVisible();
  // Newest entry in the rider's earnings log is this order, rate-able now that it is complete.
  const latest = rider.locator('section[aria-labelledby=earn-title] li').first();
  await expect(latest).toContainText("Susan");
  await expect(latest.getByText(/Rate the customer/)).toBeVisible();
});
