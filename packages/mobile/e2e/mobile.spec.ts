import { expect } from '../src';
import { test } from './fixtures';

test('signs in with YAML locators resolved for the platform', async ({ mobileLocate, testfly }) => {
  await mobileLocate('login.username').fill('ada');
  await mobileLocate('login.password').fill('s3cret');
  await expect(mobileLocate('login.username')).toHaveValue('ada');
  await mobileLocate('login.signIn').tap();
  await expect(mobileLocate('home.greeting')).toHaveText('Hello, ada');
  await expect(mobileLocate('home.orders')).toBeVisible();
  await expect(mobileLocate('home.settings')).toHaveText('Settings');
  expect(testfly.mobile?.platform).toBe(test.info().project.name);
});

test('mobileScreen exposes the Mobilewright getBy* API; web expect keeps working', async ({ mobileScreen, device }) => {
  await expect(mobileScreen.getByText('Welcome back')).toBeVisible();
  await expect(mobileScreen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await expect(mobileScreen.getByRole('button')).toHaveCount(1);
  expect(device.id).toBe('FAKE-0001');
  expect({ ok: true }).toEqual({ ok: true });
});

test('records the device, reports Mobilewright actions as steps', async ({ mobileScreen }) => {
  const annotation = test.info().annotations.find((a) => a.type === 'mobile-device');
  expect(annotation?.description).toContain('FAKE-0001 (dev.testfly.demo)');
  await mobileScreen.getByTestId('username').fill('grace');
  await expect(mobileScreen.getByTestId('username')).toHaveValue('grace');
});

test('a failed soft assertion fails the test but lets it continue', async ({ mobileScreen }) => {
  test.fail();
  await expect.soft(mobileScreen.getByText('Not on screen'), 'soft check').toBeVisible({ timeout: 200 });
  // Still running: the soft failure was recorded on the test instead of thrown.
  expect(test.info().errors).toHaveLength(1);
  test.info().annotations.push({ type: 'continued-after-soft-failure' });
});
