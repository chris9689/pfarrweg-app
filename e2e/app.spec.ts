import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, code: string) {
  await page.goto('/my');
  await page.getByLabel('Access code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My parking spaces', level: 1 })).toBeVisible();
}

test('overview is public and shows all eight spaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All parking spaces' })).toBeVisible();
  await expect(page.locator('[data-testid^="space-"]')).toHaveCount(8);
  await expect(page.getByTestId('available-count')).toBeVisible();
  await expect(page.getByRole('link', { name: 'My parking spaces' })).toBeVisible();
});

test('language can be switched and persists after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All parking spaces' })).toBeVisible();
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await expect(page.getByRole('heading', { name: 'Alle Parkplätze' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Alle Parkplätze' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'All parking spaces' })).toBeVisible();
});

test('one-off availability: create, see on overview, conflict, edit, delete', async ({ page }) => {
  await login(page, '11111111');
  const card = page.getByTestId('my-space-1');

  await card.getByRole('button', { name: 'Make available' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. Space 1 is now marked as available.')).toBeVisible();
  await expect(card.getByText(/Available until/).first()).toBeVisible();

  // Overlapping period is rejected with an explanation
  await card.getByRole('button', { name: 'Make available' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('overlaps');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Public overview reflects it
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByTestId('space-1')).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId('available-1')).toBeVisible();

  // Edit
  await page.getByRole('link', { name: 'My parking spaces' }).click();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit availability' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'More options' }).click();
  await page.getByRole('dialog').getByLabel('End date').fill(
    await page.evaluate(() => {
      const d = new Date(Date.now() + 2 * 86_400_000);
      return d.toISOString().slice(0, 10);
    }),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  // Delete
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this availability?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Availability deleted.')).toBeVisible();
  await expect(card.getByText('Nothing planned')).toBeVisible();
});

test('recurring availability: create, edit one date, edit series, delete series', async ({ page }) => {
  await login(page, '22222222');
  const card = page.getByTestId('my-space-3');
  const dialog = page.getByRole('dialog');

  await card.getByRole('button', { name: 'Make available' }).click();
  await dialog.getByRole('button', { name: 'Tomorrow' }).click();
  await dialog.getByLabel('From').selectOption('08:00');
  await dialog.getByLabel('Until').selectOption('10:00');
  await dialog.getByRole('button', { name: 'Repeat' }).click();
  await dialog.getByRole('button', { name: 'Weekly' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. Space 3 is now marked as available.')).toBeVisible();
  await expect(card.getByText(/^Every \w+ · 08:00 – 10:00$/)).toBeVisible();

  // This occurrence only
  await card.getByRole('button', { name: /^Edit .*08:00 – 10:00/ }).nth(1).click();
  await dialog.getByRole('button', { name: 'Only this date' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit single date' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Repeat' })).toHaveCount(0);
  await dialog.getByLabel('From').selectOption('09:00');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(card.getByText('Changed')).toBeVisible();

  // Entire series
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByRole('button', { name: 'All dates (entire series)' }).click();
  await dialog.getByLabel('Until').selectOption('11:00');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText(/^Every \w+ · 08:00 – 11:00$/)).toBeVisible();

  // Pause / resume
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByText('Paused')).toBeVisible();
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(card.getByText('Paused')).toHaveCount(0);

  // Delete the whole series
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('button', { name: 'All dates (entire series)' }).click();
  await page.getByRole('dialog', { name: 'Delete entire series?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(card.getByText('Nothing planned')).toBeVisible();
});

async function signOut(page: Page) {
  await page.goto('/my');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Access code')).toBeVisible();
}

test('reservation: another apartment reserves a free space, owner cannot remove it, reserver cancels', async ({ page }) => {
  // Owner (apartment 1) makes space 2 available for the rest of the day
  await login(page, '11111111');
  const ownerCard = page.getByTestId('my-space-2');
  await ownerCard.getByRole('button', { name: 'Make available' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. Space 2 is now marked as available.')).toBeVisible();
  await signOut(page);

  // Apartment 3 taps the free bay on the overview, enters its code and reserves
  await page.goto('/');
  await page.getByTestId('bay-2').getByRole('button').click();
  const dialog = page.getByRole('dialog', { name: 'Reserve space 2' });
  await dialog.getByLabel('Access code').fill('33333333');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByTestId('reserve-summary')).toBeVisible();
  await dialog.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByText(/Reserved\. Space 2 is yours/)).toBeVisible();
  await expect(page.getByTestId('bay-2')).toHaveAttribute('data-status', 'reserved');
  await expect(page.getByTestId('space-2')).toContainText('by 3');

  // Owner sees the reservation and cannot delete the availability
  await signOut(page);
  await login(page, '11111111');
  await expect(ownerCard.getByText(/^3: /)).toBeVisible();
  await ownerCard.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/has been reserved/)).toBeVisible();
  await signOut(page);

  // Reserver cancels; then the owner can remove the availability again
  await login(page, '33333333');
  await page.getByTestId('my-reservations').getByRole('button', { name: /Cancel reservation/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click();
  await expect(page.getByText('Reservation cancelled.')).toBeVisible();
  await signOut(page);
  await login(page, '11111111');
  await ownerCard.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Availability deleted.')).toBeVisible();
});

test('owner removes a future reservation; the reserving apartment sees a notice', async ({ page }) => {
  // Owner (apartment 2) makes space 4 available tomorrow 08:00–10:00
  await login(page, '22222222');
  const ownerCard = page.getByTestId('my-space-4');
  const dialog = page.getByRole('dialog');
  await ownerCard.getByRole('button', { name: 'Make available' }).click();
  await dialog.getByRole('button', { name: 'Tomorrow' }).click();
  await dialog.getByLabel('From').selectOption('08:00');
  await dialog.getByLabel('Until').selectOption('10:00');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. Space 4 is now marked as available.')).toBeVisible();
  await signOut(page);

  // Apartment 3 reserves the whole period
  await page.goto('/');
  await page.getByTestId('bay-4').getByRole('button').click();
  const reserve = page.getByRole('dialog', { name: 'Reserve space 4' });
  await reserve.getByLabel('Access code').fill('33333333');
  await reserve.getByRole('button', { name: 'Continue' }).click();
  await expect(reserve.getByTestId('reserve-summary')).toBeVisible();
  await reserve.getByRole('button', { name: 'Reserve' }).click();
  await expect(page.getByText(/Reserved\. Space 4 is yours/)).toBeVisible();
  await signOut(page);

  // Owner removes it with a message and also removes the time from the availability
  await login(page, '22222222');
  await ownerCard.getByRole('button', { name: /^Remove reservation: 3: / }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove this reservation?' });
  await expect(confirm.getByText('This cannot be undone.')).toBeVisible();
  await expect(confirm.getByRole('checkbox', { name: /Also remove this time/ })).toBeChecked();
  await confirm.getByLabel('Message to apartment 3 (optional)').fill('Sorry, I need it myself.');
  await confirm.getByRole('button', { name: 'Remove reservation' }).click();
  await expect(page.getByRole('dialog', { name: 'Reservation removed' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(ownerCard.getByText('Nothing planned')).toBeVisible();
  await signOut(page);

  // Apartment 3 sees the notice once
  await login(page, '33333333');
  const notices = page.getByTestId('notices');
  await expect(notices).toContainText('was cancelled by apartment 2');
  await expect(notices).toContainText('Sorry, I need it myself.');
  await notices.getByRole('button', { name: 'Got it' }).click();
  await expect(notices).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My parking spaces', level: 1 })).toBeVisible();
  await expect(page.getByTestId('notices')).toHaveCount(0);
  await signOut(page);
});

test('the complete workflow works in German', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await page.getByRole('link', { name: 'Meine Parkplätze' }).click();
  await page.getByLabel('Zugangscode').fill('33333333');
  await page.getByRole('button', { name: 'Weiter' }).click();
  const card = page.getByTestId('my-space-5');
  await card.getByRole('button', { name: 'Parkplatz freigeben' }).click();
  await expect(page.getByRole('dialog', { name: 'Parkplatz freigeben' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert. Parkplatz 5 ist jetzt freigegeben.')).toBeVisible();
  await expect(card.getByText(/Frei bis/).first()).toBeVisible();
  await card.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Freigabe gelöscht.')).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
});

test('administrator can issue a new access code that residents can use', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Administration', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Create new access code' }).nth(3).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create new access code' }).click();
  const code = (await page.getByTestId('new-code').textContent())!.replace(/\D/g, '');
  expect(code).toMatch(/^\d{8}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await login(page, code);
  await expect(page.getByText('Signed in as 4')).toBeVisible();
  await expect(page.getByTestId('my-space-7')).toBeVisible();
  await expect(page.getByTestId('my-space-1')).toHaveCount(0);
});

test('layout adapts to the screen size', async ({ page }, testInfo) => {
  await page.goto('/');
  const first = await page.getByTestId('space-1').boundingBox();
  const third = await page.getByTestId('space-3').boundingBox();
  if (testInfo.project.name === 'mobile') expect(third!.y).toBeGreaterThan(first!.y);
  else expect(third!.y).toBe(first!.y);
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Overview' })).toBeInViewport();
});
