import { test, expect, type Page } from '@playwright/test'
import { registerAndLogin, createCampaign, navigateToCampaign } from './helpers'

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Switch to the Chars tab in the sidebar.
 */
async function switchToCharsTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Chars' }).click()
  await page.waitForTimeout(300)
}

/**
 * Open the character create dialog and create a character with the given name.
 * After creation, the character is automatically set as active (sheet opens).
 * Assumes the Chars tab is active.
 */
async function createCharacter(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ New', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('#char-game-system option:not([value=""])')).toBeAttached({
    timeout: 5_000,
  })
  await page.locator('#char-name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Character System', () => {
  const password = 'testpassword123'

  test('character creation — created character appears in character list', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-create-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Create Test')
    await navigateToCampaign(page, 'Character Create Test')
    await switchToCharsTab(page)

    await expect(page.getByText('No characters yet.')).toBeVisible({ timeout: 5_000 })

    await createCharacter(page, 'Aragorn')

    // After creation, the sheet opens (replacing the list). Go back to list.
    await page.getByRole('button', { name: /back to list/i }).click()

    await expect(page.getByRole('button', { name: 'Aragorn', exact: false })).toBeVisible({
      timeout: 5_000,
    })
  })

  test('character list shows all created characters', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-list-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character List Test')
    await navigateToCampaign(page, 'Character List Test')
    await switchToCharsTab(page)

    await createCharacter(page, 'Legolas')
    // Go back to list to create another
    await page.getByRole('button', { name: /back to list/i }).click()
    await createCharacter(page, 'Gimli')
    await page.getByRole('button', { name: /back to list/i }).click()

    await expect(page.getByRole('button', { name: 'Legolas', exact: false })).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByRole('button', { name: 'Gimli', exact: false })).toBeVisible({
      timeout: 5_000,
    })
  })

  test('character sheet opens after creation', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-sheet-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Sheet Open Test')
    await navigateToCampaign(page, 'Character Sheet Open Test')
    await switchToCharsTab(page)

    // Creating a character automatically opens its sheet
    await createCharacter(page, 'Gandalf')

    // The sheet should be visible with the character name in the header input
    const nameInput = page.locator('input[type="text"]').first()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await expect(nameInput).toHaveValue('Gandalf', { timeout: 5_000 })
  })

  test('field editing — edited value is reflected in the sheet', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-field-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Field Edit Test')
    await navigateToCampaign(page, 'Character Field Edit Test')
    await switchToCharsTab(page)

    // Creating opens the sheet automatically
    await createCharacter(page, 'Frodo')

    const nameInput = page.locator('input[type="text"]').first()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await expect(nameInput).toHaveValue('Frodo', { timeout: 5_000 })

    // Look for a schema-driven numeric field (e.g., Strength)
    const strengthInput = page.locator('input[type="number"]').first()
    const strengthVisible = await strengthInput.isVisible().catch(() => false)

    if (strengthVisible) {
      await strengthInput.fill('18')
      await page.waitForTimeout(800)
      await expect(strengthInput).toHaveValue('18')
    } else {
      await nameInput.fill('Frodo Baggins')
      await page.waitForTimeout(800)
      await expect(nameInput).toHaveValue('Frodo Baggins')
    }
  })

  test('sheet persistence across reload — edited field value survives a page reload', async ({
    page,
  }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-persist-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Persist Test')
    await navigateToCampaign(page, 'Character Persist Test')
    await switchToCharsTab(page)

    // Creating opens the sheet automatically
    await createCharacter(page, 'Boromir')

    const nameInput = page.locator('input[type="text"]').first()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    // Edit a numeric field (persisted via WS → server → DB)
    const numberInput = page.locator('input[type="number"]').first()
    await expect(numberInput).toBeVisible({ timeout: 5_000 })
    const originalValue = await numberInput.inputValue()
    const newValue = originalValue === '18' ? '16' : '18'

    await numberInput.fill(newValue)
    // Wait for debounce (300ms) + server roundtrip
    await page.waitForTimeout(1_500)

    // Reload the page
    await page.reload()
    await expect(page).toHaveURL(/\/campaigns\//, { timeout: 10_000 })

    // Switch to Chars tab and click the character to re-open the sheet
    await switchToCharsTab(page)
    await expect(
      page.getByRole('button', { name: 'Boromir', exact: false }),
    ).toBeVisible({ timeout: 5_000 })
    // Character list button is a toggle — click to open sheet
    await page.getByRole('button', { name: 'Boromir', exact: false }).click()

    // Verify the numeric field still has the edited value
    const reloadedInput = page.locator('input[type="number"]').first()
    await expect(reloadedInput).toBeVisible({ timeout: 5_000 })
    await expect(reloadedInput).toHaveValue(newValue, { timeout: 5_000 })
  })
})
