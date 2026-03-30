import { test, expect, type Page } from '@playwright/test'
import { registerAndLogin, createCampaign, navigateToCampaign } from './helpers'

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Open the character create dialog and create a character with the given name.
 * Assumes the page is already on the campaign view.
 */
async function createCharacter(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ New', exact: true }).click()
  // Wait for the dialog to open
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
  // Wait for game systems to load (the select should have a real option, not "Loading...")
  await expect(page.locator('#char-game-system option:not([value=""])')).toBeAttached({
    timeout: 5_000,
  })
  // Fill in character name
  await page.locator('#char-name').fill(name)
  // Submit
  await page.getByRole('button', { name: 'Create' }).click()
  // Dialog should close
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

    // The character list should show no characters initially
    await expect(page.getByText('No characters yet.')).toBeVisible({ timeout: 5_000 })

    // Create a character
    await createCharacter(page, 'Aragorn')

    // The character should now appear in the list
    await expect(page.getByRole('button', { name: 'Aragorn', exact: false })).toBeVisible({
      timeout: 5_000,
    })
  })

  test('character list shows all created characters', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-list-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character List Test')
    await navigateToCampaign(page, 'Character List Test')

    // Create two characters
    await createCharacter(page, 'Legolas')
    await createCharacter(page, 'Gimli')

    // Both should appear in the list
    await expect(page.getByRole('button', { name: 'Legolas', exact: false })).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByRole('button', { name: 'Gimli', exact: false })).toBeVisible({
      timeout: 5_000,
    })
  })

  test('character sheet opens on click', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-sheet-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Sheet Open Test')
    await navigateToCampaign(page, 'Character Sheet Open Test')

    // Create a character
    await createCharacter(page, 'Gandalf')

    // Click the character in the list — it uses role="button"
    await page.getByRole('button', { name: 'Gandalf', exact: false }).click()

    // The character sheet panel should become visible with the character name
    // The sheet renders an input at the top containing the character name
    await expect(page.locator('input[type="text"][value="Gandalf"]')).toBeVisible({
      timeout: 5_000,
    })
  })

  test('field editing — edited value is reflected in the sheet', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-field-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Field Edit Test')
    await navigateToCampaign(page, 'Character Field Edit Test')

    await createCharacter(page, 'Frodo')

    // Open the character sheet by clicking the character in the list
    await page.getByRole('button', { name: 'Frodo', exact: false }).click()

    // The sheet renders a header input with the character name
    const nameInput = page.locator('input[type="text"][value="Frodo"]')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    // Look for a schema-driven numeric field. The schema may or may not have loaded;
    // if the sheet has a field labelled "Strength" we edit it, otherwise we fall back
    // to editing the name input which always exists.
    const strengthInput = page.locator('input[type="number"]').first()
    const strengthVisible = await strengthInput.isVisible().catch(() => false)

    if (strengthVisible) {
      await strengthInput.fill('18')
      // Wait for debounce (300 ms) + server roundtrip
      await page.waitForTimeout(800)
      // Value should still be 18
      await expect(strengthInput).toHaveValue('18')
    } else {
      // Edit the name field (debounced WS send for __name__)
      await nameInput.fill('Frodo Baggins')
      await page.waitForTimeout(800)
      await expect(page.locator('input[type="text"]').first()).toHaveValue('Frodo Baggins')
    }
  })

  test('sheet persistence across reload — edited field value survives a page reload', async ({
    page,
  }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-char-persist-${ts}@test.com`, password, 'Char Tester')
    await createCampaign(page, 'Character Persist Test')
    await navigateToCampaign(page, 'Character Persist Test')

    await createCharacter(page, 'Boromir')

    // Open the sheet
    await page.getByRole('button', { name: 'Boromir', exact: false }).click()
    const nameInput = page.locator('input[type="text"][value="Boromir"]')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    // Edit the name (always available, debounced WS UpdateCharacterFields)
    await nameInput.fill('Boromir of Gondor')
    // Wait for debounce + server roundtrip to persist the value
    await page.waitForTimeout(1_500)

    // Reload the page — the server should return the updated name
    await page.reload()

    // Navigate back into the campaign (reload lands on the same URL)
    await expect(page).toHaveURL(/\/campaigns\//, { timeout: 10_000 })

    // The character should still appear in the list with its new name
    await expect(
      page.getByRole('button', { name: 'Boromir of Gondor', exact: false }),
    ).toBeVisible({ timeout: 5_000 })
  })
})
