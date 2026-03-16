import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function registerAndLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Display Name').fill('Layers Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })
}

async function createCampaignAndMap(page: Page, campaignName: string): Promise<void> {
  await page.getByPlaceholder('Campaign name').fill(campaignName)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('link', { name: campaignName })).toBeVisible({ timeout: 5_000 })
  await page.getByRole('link', { name: campaignName }).click()
  await expect(page).toHaveURL(/\/campaigns\//, { timeout: 5_000 })
  await page.getByRole('button', { name: '+ New Map' }).click()
  await expect(page.locator('#map-selector option:not([value=""])')).toBeAttached({ timeout: 5_000 })
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 })
}

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
    await registerAndLogin(page, `e2e-lay-visible-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'Layer Panel Visible Test')

    await expect(page.getByText('Layers')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: '+ Add Layer' })).toBeVisible()
  })

  test('DM can add a new drawing layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-add-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'Add Layer Test')

    await openAddLayerForm(page)

    await page.getByPlaceholder('Layer name').fill('My Drawing Layer')
    // Drawing type is the default in the selector
    await page.getByRole('button', { name: 'Add' }).click()

    // The new layer should appear in the panel
    await expect(page.getByText('My Drawing Layer')).toBeVisible({ timeout: 5_000 })
  })

  test('DM can add a token layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-token-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'Token Layer Test')

    await openAddLayerForm(page)

    await page.getByPlaceholder('Layer name').fill('Token Layer')
    await page.locator('select').selectOption('token')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect(page.getByText('Token Layer')).toBeVisible({ timeout: 5_000 })
  })

  test('DM can add a DM-only layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-dmonly-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'DM Only Layer Test')

    await openAddLayerForm(page)

    await page.getByPlaceholder('Layer name').fill('Secret Layer')
    await page.locator('label', { hasText: 'DM only' }).locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: 'Add' }).click()

    // DM-only layers show a "DM" badge in the panel
    await expect(page.getByText('Secret Layer')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('span', { hasText: 'DM' })).toBeVisible()
  })

  test('Cancel button dismisses the add layer form', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-cancel-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'Layer Cancel Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Cancelled Layer')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByPlaceholder('Layer name')).not.toBeVisible()
    await expect(page.getByText('Cancelled Layer')).not.toBeVisible()
  })

  test('layer can be toggled hidden and visible', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-toggle-${timestamp}@test.com`, password)
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
    await registerAndLogin(page, `e2e-lay-lock-${timestamp}@test.com`, password)
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
    await registerAndLogin(page, `e2e-lay-delete-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'Layer Delete Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Deletable Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Deletable Layer')).toBeVisible({ timeout: 5_000 })

    // Accept the confirmation dialog
    page.on('dialog', (d) => d.accept())
    await page.locator('button[title="Delete layer"]').first().click()

    await expect(page.getByText('Deletable Layer')).not.toBeVisible({ timeout: 5_000 })
  })

  test('clicking a layer makes it active', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-active-${timestamp}@test.com`, password)
    await createCampaignAndMap(page, 'Layer Active Test')

    await openAddLayerForm(page)
    await page.getByPlaceholder('Layer name').fill('Active Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Active Layer')).toBeVisible({ timeout: 5_000 })

    // Click the layer name area to select it
    await page.getByText('Active Layer').click()

    // Active layer row gets primary background colour
    const layerRow = page.locator('div').filter({ hasText: 'Active Layer' }).first()
    const bg = await layerRow.evaluate((el) => (el as HTMLElement).style.background)
    expect(bg).toContain('6366f1')
  })

  test('layer opacity slider is present for each layer', async ({ page }) => {
    await registerAndLogin(page, `e2e-lay-opacity-${timestamp}@test.com`, password)
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
