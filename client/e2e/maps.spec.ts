import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function registerAndLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Display Name').fill('Maps Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })
}

async function createCampaign(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder('Campaign name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 5_000 })
}

async function navigateToCampaign(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name }).click()
  await expect(page).toHaveURL(/\/campaigns\//, { timeout: 5_000 })
}

async function createMap(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ New Map' }).click()
  // Wait for the map to appear in the selector
  await expect(page.locator('#map-selector option:not([value=""])')).toBeAttached({
    timeout: 5_000,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Map Management', () => {
  const timestamp = Date.now()
  const email = `e2e-maps-${timestamp}@test.com`
  const password = 'testpassword123'

  test('DM can create a new map', async ({ page }) => {
    await registerAndLogin(page, email, password)
    await createCampaign(page, 'Map Creation Test')
    await navigateToCampaign(page, 'Map Creation Test')

    // Initially no maps — selector shows only the placeholder
    const selector = page.locator('#map-selector')
    await expect(selector).toBeVisible()
    const initialOptions = await selector.locator('option').count()

    // Create a new map
    await createMap(page)

    // Selector should now have one more option ("New Map")
    const updatedOptions = await selector.locator('option').count()
    expect(updatedOptions).toBeGreaterThan(initialOptions)

    // The newly created map should be auto-selected
    const selectedValue = await selector.inputValue()
    expect(selectedValue).not.toBe('')
  })

  test('map appears in the selector after creation', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-maps-list-${ts}@test.com`, password)
    await createCampaign(page, 'Map List Test')
    await navigateToCampaign(page, 'Map List Test')

    await createMap(page)

    // "New Map" entry should exist in the dropdown
    const selector = page.locator('#map-selector')
    await expect(selector.locator('option', { hasText: 'New Map' })).toBeAttached()
  })

  test('selecting a map from the dropdown loads it into the canvas', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-maps-select-${ts}@test.com`, password)
    await createCampaign(page, 'Map Select Test')
    await navigateToCampaign(page, 'Map Select Test')

    await createMap(page)

    // Wait for canvas to become visible after map load
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10_000 })
  })

  test('Map Settings button appears when a map is selected', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-maps-settings-btn-${ts}@test.com`, password)
    await createCampaign(page, 'Map Settings Btn Test')
    await navigateToCampaign(page, 'Map Settings Btn Test')

    // Button should not exist yet
    await expect(page.getByRole('button', { name: /Map Settings/ })).not.toBeVisible()

    await createMap(page)

    // After selecting a map the button should appear
    await expect(page.getByRole('button', { name: /Map Settings/ })).toBeVisible({ timeout: 5_000 })
  })

  test('grid can be toggled on and off via Map Settings', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-maps-grid-${ts}@test.com`, password)
    await createCampaign(page, 'Grid Toggle Test')
    await navigateToCampaign(page, 'Grid Toggle Test')

    await createMap(page)

    // Open Map Settings panel
    await page.getByRole('button', { name: /Map Settings/ }).click()
    await expect(page.getByText('Map Settings')).toBeVisible({ timeout: 3_000 })

    // Grid checkbox should exist
    const gridCheckbox = page.getByRole('checkbox', { name: /Enabled/i })
    await expect(gridCheckbox).toBeVisible()
    const wasChecked = await gridCheckbox.isChecked()

    // Toggle the grid
    await gridCheckbox.click()
    expect(await gridCheckbox.isChecked()).toBe(!wasChecked)

    // Save the changes
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Navigate back
    await page.getByRole('button', { name: /← Back/ }).click()
    await expect(page.getByRole('button', { name: /Map Settings/ })).toBeVisible()
  })

  test('grid cell size can be changed in Map Settings', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-maps-cellsize-${ts}@test.com`, password)
    await createCampaign(page, 'Grid Cell Size Test')
    await navigateToCampaign(page, 'Grid Cell Size Test')

    await createMap(page)

    await page.getByRole('button', { name: /Map Settings/ }).click()
    await expect(page.getByText('Map Settings')).toBeVisible({ timeout: 3_000 })

    // Change cell size
    const cellSizeInput = page.getByLabel(/Cell size/i)
    await cellSizeInput.fill('80')
    await page.getByRole('button', { name: 'Save Changes' }).click()

    // Should not show an error
    await expect(page.locator('text=Save failed')).not.toBeVisible()
  })

  test('multiple maps can coexist in one campaign', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-maps-multi-${ts}@test.com`, password)
    await createCampaign(page, 'Multi Map Test')
    await navigateToCampaign(page, 'Multi Map Test')

    await createMap(page)
    await createMap(page)

    // Selector should have at least 2 non-placeholder options
    const selector = page.locator('#map-selector')
    const optionCount = await selector.locator('option:not([value=""])').count()
    expect(optionCount).toBeGreaterThanOrEqual(2)
  })
})
