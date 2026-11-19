import { test, expect } from '@playwright/test';

const email = process.env.COACH_IN_TEST_EMAIL;
const password = process.env.COACH_IN_TEST_PASSWORD;

test('la page de connexion Coach In est accessible', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'La page doit répondre').not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Coach In/i);
  await expect(page.locator('#auth-view')).toBeVisible();
  await expect(page.locator('#auth-form input[name="email"]')).toBeVisible();
  await expect(page.locator('#auth-form input[name="password"]')).toBeVisible();
  await expect(page.locator('#auth-submit')).toHaveText(/Se connecter/i);
});

test('connexion joueur, droits du rôle et persistance de session', async ({ page }) => {
  test.skip(!email || !password, 'Identifiants E2E absents : définir COACH_IN_TEST_EMAIL et COACH_IN_TEST_PASSWORD dans les secrets CI.');

  await page.goto('/');
  await page.locator('#auth-form input[name="email"]').fill(email);
  await page.locator('#auth-form input[name="password"]').fill(password);
  await page.locator('#auth-submit').click();

  await expect(page.locator('#app-view')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#account-label')).toContainText(/Joueur/i);

  const navigation = page.locator('#navigation');
  await expect(navigation.locator('[data-page="dashboard"]')).toBeVisible();
  await expect(navigation.locator('[data-page="passport"]')).toBeVisible();
  await expect(navigation.locator('[data-page="sessions"]')).toBeVisible();
  await expect(navigation.locator('[data-page="matches"]')).toBeVisible();
  await expect(navigation.locator('[data-page="messages"]')).toBeVisible();

  await page.reload();
  await expect(page.locator('#app-view')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#account-label')).toContainText(/Joueur/i);

  await page.locator('#logout').click();
  await expect(page.locator('#auth-view')).toBeVisible();
});
