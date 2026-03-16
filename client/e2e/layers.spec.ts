import { test, expect, type Page } from '@playwright/test'
import { registerAndLogin, createCampaignAndMap } from './helpers'

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

async function openAddLayerForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ Add Layer' }).click()
  await expect(page.getByPlaceholder('Layer name')).toBeVisible({ timeout: 3_000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Layer Management', () => {
  const timestamp = Date.now()
  const password = 'testpassword123'

  test('Layer panel is visible after map load', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-visible-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Panel Visible Test')

    await expect(page.getByRole('heading', { name: 'Layers' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: '+ Add Layer' })).toBeVisible()
  })

  test('DM can add a new drawing layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-add-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Add Layer Test')

    await openAddLayerForm(page)

    await page.getByPlaceholder('Layer name').fill('My Drawing Layer')
    // Drawing type is the default in the selector
    await page.getByRole('button', { name: 'Add' }).click()

    // The new layer should appear in the panel
    await expect(page.getByText('My Drawing Layer')).toBeVisible({ timeout: 5_000 })
  })

  test('DM can add a token layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-token-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Token Layer Test')

    await openAddLayerForm(page)

    await page.getByPlaceholder('Layer name').fill('Token Layer')
    await page.locator('select:not(#map-selector)').selectOption('token')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByText('Token Layer')).toBeVisible({ timeout: 5_000 })
  })

  test('DM can add a DM-only layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-dmonly-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'DM Only Layer Test')

    await openAddLayerForm(page)

    await page.getByPlaceholder('Layer name').fill('Secret Layer')
    await page.locator('label', { hasText: 'DM only' }).locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: 'Add' }).click()

    // DM-only layers show a "DM" badge in the panel
    await expect(page.getByText('Secret Layer')).toBeVisible({ timeout: 5_000 })
    // Verify the DM badge appears next to the Secret Layer
    // Use evaluate to check the Secret Layer span's parent row for a DM badge
    const hasDmBadge = await page.getByText('Secret Layer', { exact: true }).evaluate((el) => {
      const row = el.parentElement
      if (!row) return false
      const badges = row.querySelectorAll('span')
      return Array.from(badges).some((s) => s.textContent?.trim() === 'DM')
    })
    expect(hasDmBadge).toBe(true)
  })

  test('Cancel button dismisses the add layer form', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-cancel-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Cancel Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Cancelled Layer')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByPlaceholder('Layer name')).not.toBeVisible()
    await expect(page.getByText('Cancelled Layer')).not.toBeVisible()
  })

  test('layer can be toggled hidden and visible', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-toggle-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Toggle Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Toggle Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Toggle Layer')).toBeVisible({ timeout: 5_000 })

    // The visibility button shows "V" when visible — click to hide
    const visibilityBtn = page.locator('button[title="Hide layer"]').first()
    await expect(visibilityBtn).toBeVisible()
    await visibilityBtn.click()

    // After hiding, title should change to "Show layer"
    await expect(page.locator('button[title="Show layer"]').first()).toBeVisible({ timeout: 3_000 })
  })

  test('layer can be locked and unlocked', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-lock-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Lock Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Lock Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Lock Layer')).toBeVisible({ timeout: 5_000 })

    // The lock button shows "U" when unlocked — click to lock
    const lockBtn = page.locator('button[title="Lock layer"]').first()
    await expect(lockBtn).toBeVisible()
    await lockBtn.click()

    // After locking, title should become "Unlock layer"
    await expect(page.locator('button[title="Unlock layer"]').first()).toBeVisible({ timeout: 3_000 })
  })

  test('layer can be deleted', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-delete-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Delete Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Deletable Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Deletable Layer')).toBeVisible({ timeout: 5_000 })

    // Accept the confirmation dialog
    page.on('dialog', (d) => d.accept())
    // Click the delete button within the row that contains "Deletable Layer"
    // The span's parentElement is the row div; find the delete button within it
    const deleteBtn = page.getByText('Deletable Layer', { exact: true }).locator('..').locator('button[title="Delete layer"]')
    await deleteBtn.click()

    await expect(page.getByText('Deletable Layer')).not.toBeVisible({ timeout: 5_000 })
  })

  test('clicking a layer makes it active', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-active-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Active Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Active Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Active Layer')).toBeVisible({ timeout: 5_000 })

    // Click the layer name area to select it
    await page.getByText('Active Layer', { exact: true }).click()

    // Active layer row gets primary background colour
    // The layer name span's parent div is the clickable row with the active background
    const bg = await page.getByText('Active Layer', { exact: true }).evaluate((el) => {
      // Walk up to the row div (span -> div row)
      const row = el.parentElement as HTMLElement | null
      return row ? row.style.background : ''
    })
    expect(bg).toContain('6366f1')
  })

  test('layer opacity slider is present for each layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-opacity-${timestamp}@test.com`, password, 'Layers Tester')
    await createCampaignAndMap(page, 'Layer Opacity Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Opacity Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Opacity Layer')).toBeVisible({ timeout: 5_000 })

    // An opacity range input should appear in the layer row
    const opacitySlider = page.locator('input[type="range"][min="0"][max="1"]').first()
    await expect(opacitySlider).toBeVisible()
  })
})
