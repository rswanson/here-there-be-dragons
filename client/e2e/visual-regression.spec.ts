import { test, expect } from '@playwright/test'
import { setupCampaignWithMap } from './helpers'

// Skip in CI — snapshots are platform-dependent (darwin vs linux render differently)
test.skip(!!process.env.CI, 'Visual regression tests are local-only (platform-dependent snapshots)')

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
