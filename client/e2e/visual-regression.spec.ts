import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function registerAndLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Display Name').fill('Visual Regression Tester')
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
  await expect(page.locator('#map-selector option:not([value=""])')).toBeAttached({
    timeout: 5_000,
  })
}

async function waitForCanvasReady(page: Page): Promise<void> {
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  // Allow WebGL to finish rendering
  await page.waitForTimeout(2000)
}

async function setupCampaignWithMap(
  page: Page,
  email: string,
  password: string,
  campaignName: string,
): Promise<void> {
  await registerAndLogin(page, email, password)
  await createCampaign(page, campaignName)
  await navigateToCampaign(page, campaignName)
  await createMap(page)
  await waitForCanvasReady(page)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Visual Regression', () => {
  const timestamp = Date.now()
  const password = 'testpassword123'

  test('grid rendering at default zoom', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-visual-${timestamp}-default-zoom@test.com`,
      password,
      'Visual Default Zoom',
    )

    const canvas = page.locator('canvas')
    await expect(canvas).toHaveScreenshot('grid-default-zoom.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('grid at 2x zoom', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-visual-${timestamp}-zoom-in@test.com`,
      password,
      'Visual Zoom In',
    )

    const canvas = page.locator('canvas')

    // Zoom in via mouse wheel — negative deltaY zooms in
    // Multiple scroll events to reach approximately 2x zoom
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(100)
    }
    // Wait for zoom animation to settle and WebGL to re-render
    await page.waitForTimeout(1500)

    await expect(canvas).toHaveScreenshot('grid-zoom-2x.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('grid at 0.5x zoom', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-visual-${timestamp}-zoom-out@test.com`,
      password,
      'Visual Zoom Out',
    )

    const canvas = page.locator('canvas')

    // Zoom out via mouse wheel — positive deltaY zooms out
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(100)
    }
    // Wait for zoom animation to settle and WebGL to re-render
    await page.waitForTimeout(1500)

    await expect(canvas).toHaveScreenshot('grid-zoom-half.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('token with bars on canvas', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-visual-${timestamp}-token-bars@test.com`,
      password,
      'Visual Token Bars',
    )

    const canvas = page.locator('canvas')

    // Place a token by double-clicking the canvas center
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Canvas bounding box not found')
    await canvas.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })

    // Wait for token to appear on canvas
    await page.waitForTimeout(1500)

    // If a token inspector appeared, add an HP bar
    const inspectorHeading = page.locator('h3', { hasText: 'Token' })
    const inspectorVisible = await inspectorHeading.isVisible().catch(() => false)

    if (inspectorVisible) {
      // Add an HP bar via the inspector
      const addBarBtn = page.getByRole('button', { name: '+ Add' })
      const addVisible = await addBarBtn.isVisible().catch(() => false)
      if (addVisible) {
        await addBarBtn.click()
        // Fill in bar values
        const labelInput = page.getByPlaceholder('Label')
        const labelVisible = await labelInput.isVisible().catch(() => false)
        if (labelVisible) {
          await labelInput.fill('HP')
        }
        // Save changes
        const saveBtn = page.getByRole('button', { name: 'Save' })
        const saveVisible = await saveBtn.isVisible().catch(() => false)
        if (saveVisible) {
          await saveBtn.click()
          await page.waitForTimeout(1000)
        }
      }
    }

    // Wait for canvas to re-render with token
    await page.waitForTimeout(1000)

    await expect(canvas).toHaveScreenshot('token-with-bars.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('multiple stacked layers', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-visual-${timestamp}-layers@test.com`,
      password,
      'Visual Layers',
    )

    // Add a drawing layer
    await page.getByRole('button', { name: '+ Add Layer' }).click()
    await expect(page.getByPlaceholder('Layer name')).toBeVisible({ timeout: 3_000 })
    await page.getByPlaceholder('Layer name').fill('Drawing Layer')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Drawing Layer')).toBeVisible({ timeout: 5_000 })

    // Add a token layer
    await page.getByRole('button', { name: '+ Add Layer' }).click()
    await expect(page.getByPlaceholder('Layer name')).toBeVisible({ timeout: 3_000 })
    await page.getByPlaceholder('Layer name').fill('Token Layer')
    await page.locator('select:not(#map-selector)').selectOption('token')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('Token Layer')).toBeVisible({ timeout: 5_000 })

    // Add a DM-only layer
    await page.getByRole('button', { name: '+ Add Layer' }).click()
    await expect(page.getByPlaceholder('Layer name')).toBeVisible({ timeout: 3_000 })
    await page.getByPlaceholder('Layer name').fill('DM Secret Layer')
    await page.locator('label', { hasText: 'DM only' }).locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('DM Secret Layer')).toBeVisible({ timeout: 5_000 })

    // Wait for canvas to render all layers
    await page.waitForTimeout(1500)

    const canvas = page.locator('canvas')
    await expect(canvas).toHaveScreenshot('multiple-stacked-layers.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})
