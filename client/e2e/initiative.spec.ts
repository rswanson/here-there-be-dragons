import { test, expect, type Page } from '@playwright/test'
import { registerAndLogin, createCampaign, navigateToCampaign } from './helpers'

const PASSWORD = 'testpassword123'

/**
 * Start a combat encounter with one manual combatant.
 * Assumes the page is already on the campaign view and the user is DM.
 */
async function startCombatEncounter(page: Page): Promise<void> {
  // Wait for the "Start Combat" button (only visible to DM when no active encounter)
  await expect(page.getByRole('button', { name: 'Start Combat' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Start Combat' }).click()

  // The inline form should appear — fill in a manual combatant
  await expect(page.getByPlaceholder('Name')).toBeVisible({ timeout: 5_000 })
  await page.getByPlaceholder('Name').fill('Goblin')
  await page.getByPlaceholder('Init').fill('12')
  await page.getByRole('button', { name: '+', exact: true }).click()

  // Click the "Start" button to launch the encounter
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible({
    timeout: 5_000,
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
}

test.describe('Initiative / Combat', () => {
  test('start combat — initiative panel appears', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-init-start-${ts}@test.com`, PASSWORD, 'DM Init')
    await createCampaign(page, `Initiative Start Campaign ${ts}`)
    await navigateToCampaign(page, `Initiative Start Campaign ${ts}`)

    await startCombatEncounter(page)

    // The InitiativePanel should now be visible with the round header
    await expect(page.getByText(/Initiative — Round/)).toBeVisible({ timeout: 10_000 })

    // The manual combatant should appear in the panel
    await expect(page.getByText('Goblin')).toBeVisible({ timeout: 5_000 })
  })

  test('end combat — initiative panel disappears', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-init-end-${ts}@test.com`, PASSWORD, 'DM End')
    await createCampaign(page, `Initiative End Campaign ${ts}`)
    await navigateToCampaign(page, `Initiative End Campaign ${ts}`)

    await startCombatEncounter(page)

    // Confirm the initiative panel is visible first
    await expect(page.getByText(/Initiative — Round/)).toBeVisible({ timeout: 10_000 })

    // Register dialog handler BEFORE clicking (confirm dismisses the window.confirm)
    page.once('dialog', (dialog) => {
      void dialog.accept()
    })

    // Click the "End" button in the InitiativePanel header
    await page.getByRole('button', { name: 'End', exact: true }).click()

    // The initiative panel should disappear
    await expect(page.getByText(/Initiative — Round/)).not.toBeVisible({ timeout: 10_000 })

    // The "Start Combat" button should reappear
    await expect(page.getByRole('button', { name: 'Start Combat' })).toBeVisible({
      timeout: 10_000,
    })
  })
})
