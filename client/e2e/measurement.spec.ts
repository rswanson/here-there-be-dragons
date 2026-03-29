import { test, expect } from '@playwright/test'
import { registerAndLogin, createCampaignAndMap } from './helpers'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Measurement Tools', () => {
  const timestamp = Date.now()
  const password = 'testpassword123'

  test('Ruler and Waypoint tools are present in the Measure group', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-tools-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Measurement Tools Present Test')

    await expect(page.getByRole('button', { name: 'Ruler' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Waypoint' })).toBeVisible()
  })

  test('keyboard shortcut M activates the Ruler tool', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-key-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Ruler Keyboard Shortcut Test')

    await page.keyboard.press('m')

    const rulerBtn = page.getByRole('button', { name: 'Ruler' })
    const bg = await rulerBtn.evaluate((el) => (el as HTMLElement).style.background)
    expect(bg).toContain('6366f1')
  })

  test('dragging with the Ruler tool does not throw errors', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-drag-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Ruler Drag Test')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.getByRole('button', { name: 'Ruler' }).click()

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) {
      // Drag from one grid cell to another to trigger distance calculation
      await page.mouse.move(box.x + 100, box.y + 100)
      await page.mouse.down()
      await page.mouse.move(box.x + 300, box.y + 100)
      await page.mouse.move(box.x + 300, box.y + 300)
      await page.mouse.up()
    }

    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })

  test('measurement overlay is accessible via aria-live region', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-aria-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Measurement Aria Test')

    // The accessibility DOM includes an aria-live region for measurements
    // (see AccessibilityDOM.ts). Verify it is present in the DOM.
    const ariaLive = page.locator('[aria-live][aria-atomic="true"]')
    await expect(ariaLive).toBeAttached({ timeout: 5_000 })
  })

  test('diagonal mode D&D Standard is selectable in Map Settings', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-diag-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Diagonal Mode Test')

    await page.getByRole('button', { name: /Map Settings/ }).click()
    await expect(page.getByText('Map Settings')).toBeVisible({ timeout: 3_000 })

    // All three diagonal modes should be present as radio buttons
    await expect(page.getByRole('radio', { name: /D&D Standard/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Euclidean/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Manhattan/i })).toBeVisible()

    // Switch to Euclidean
    await page.getByRole('radio', { name: /Euclidean/i }).click()
    await expect(page.getByRole('radio', { name: /Euclidean/i })).toBeChecked()

    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.locator('text=Save failed')).not.toBeVisible()
  })

  test('snap mode options are selectable in Map Settings', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-snap-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Snap Mode Test')

    await page.getByRole('button', { name: /Map Settings/ }).click()
    await expect(page.getByText('Map Settings')).toBeVisible({ timeout: 3_000 })

    // Snap modes: Off, Center, Corner
    await expect(page.getByRole('radio', { name: /Off/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Center/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Corner/i })).toBeVisible()

    // Switch to Center snapping
    await page.getByRole('radio', { name: /Center/i }).click()
    await expect(page.getByRole('radio', { name: /Center/i })).toBeChecked()

    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.locator('text=Save failed')).not.toBeVisible()
  })

  test('grid scale and unit can be changed in Map Settings', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-scale-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Grid Scale Test')

    await page.getByRole('button', { name: /Map Settings/ }).click()
    await expect(page.getByText('Map Settings')).toBeVisible({ timeout: 3_000 })

    // Scale value
    const scaleInput = page.getByLabel(/Scale value/i)
    await scaleInput.fill('10')

    // Unit selector
    const unitSelect = page.locator('select').filter({ hasText: 'ft' })
    await unitSelect.selectOption('m')

    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.locator('text=Save failed')).not.toBeVisible()
  })

  test('Waypoint tool can be activated and clicked on canvas', async ({ page }) => {
    await registerAndLogin(page, `e2e-meas-waypoint-${timestamp}@test.com`, password, 'Measurement Tester')
    await createCampaignAndMap(page, 'Waypoint Tool Test')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.getByRole('button', { name: 'Waypoint' }).click()

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) {
      // Click several points to lay down a waypoint path
      await page.mouse.click(box.x + 100, box.y + 100)
      await page.mouse.click(box.x + 200, box.y + 150)
      await page.mouse.click(box.x + 300, box.y + 100)
    }

    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })
})
