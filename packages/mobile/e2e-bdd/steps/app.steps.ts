import { expect } from '@testfly/mobile/bdd';
import { Given, Then, When } from './fixtures';

Given('the app shows the login screen', async ({ mobileScreen }) => {
  await expect(mobileScreen.getByText('Welcome back')).toBeVisible();
});

When('I sign in as {string}', async ({ mobileLocate }, user: string) => {
  await mobileLocate('login.username').fill(user);
  await mobileLocate('login.password').fill('s3cret');
  await mobileLocate('login.signIn').tap();
});

When('I type {string} into {string}', async ({ mobileLocate }, text: string, key: string) => {
  await mobileLocate(key).fill(text);
});

Then('{string} shows {string}', async ({ mobileLocate }, key: string, text: string) => {
  await expect(mobileLocate(key)).toHaveText(text);
});

Then('{string} has the value {string}', async ({ mobileLocate }, key: string, value: string) => {
  await expect(mobileLocate(key)).toHaveValue(value);
});

Then('{string} is visible', async ({ mobileLocate }, key: string) => {
  await expect(mobileLocate(key)).toBeVisible();
});

Then('the sign-in button is disabled', async ({ mobileScreen }) => {
  await expect(mobileScreen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});
