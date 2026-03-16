import { test, expect, type Page } from '@playwright/test'
import { registerAndLogin, createCampaignAndMap } from './helpers'

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

async function activateTool(page: Page, toolLabel: string): Promise<void> {
  await page.getByRole('button', { name: toolLabel }).click()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Drawing Tools', () => {
  const timestamp = Date.now()
  const password = 'testpassword123'

  test('all drawing tools are present in the toolbar', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-tools-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Drawing Tools Present Test')

    const drawTools = ['Freehand', 'Rectangle', 'Circle', 'Polygon', 'Eraser']
    for (const tool of drawTools) {
      await expect(page.getByRole('button', { name: tool })).toBeVisible()
    }
    // "Line" appears in both Draw and AoE groups; use the title to disambiguate
    await expect(page.locator('button[title="Line (L)"]')).toBeVisible()
  })

  test('AoE tools are present in the toolbar', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-aoe-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'AoE Tools Present Test')

    const aoeTools = ['Cone', 'Cube', 'Sphere']
    for (const tool of aoeTools) {
      await expect(page.getByRole('button', { name: tool })).toBeVisible()
    }
  })

  test('selecting Freehand tool shows draw settings panel', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-settings-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Draw Settings Test')

    await activateTool(page, 'Freehand')

    // Draw settings (color + width inputs) should appear below the tool buttons
    await expect(page.locator('input[type="color"]')).toBeVisible()
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
  })

  test('selecting Select tool hides draw settings panel', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-hide-settings-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Draw Settings Hide Test')

    // Open draw settings first
    await activateTool(page, 'Freehand')
    await expect(page.locator('input[type="color"]')).toBeVisible()

    // Switch back to Select — the draw settings should go away
    await activateTool(page, 'Select')
    await expect(page.locator('input[type="color"]')).not.toBeVisible()
  })

  test('freehand drawing on canvas does not throw errors', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-freehand-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Freehand Drawing Test')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await activateTool(page, 'Freehand')

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) {
      // Simulate a drag to draw a freehand stroke
      await page.mouse.move(box.x + 100, box.y + 100)
      await page.mouse.down()
      await page.mouse.move(box.x + 150, box.y + 150)
      await page.mouse.move(box.x + 200, box.y + 120)
      await page.mouse.up()
    }

    // Allow a brief render cycle
    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })

  test('rectangle drawing on canvas does not throw errors', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-rect-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Rectangle Drawing Test')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await activateTool(page, 'Rectangle')

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 80, box.y + 80)
      await page.mouse.down()
      await page.mouse.move(box.x + 200, box.y + 180)
      await page.mouse.up()
    }

    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })

  test('line drawing on canvas does not throw errors', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-line-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Line Drawing Test')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // "Line" appears in both Draw and AoE groups; use title to select the drawing Line tool
    await page.locator('button[title="Line (L)"]').click()

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 60, box.y + 60)
      await page.mouse.down()
      await page.mouse.move(box.x + 250, box.y + 200)
      await page.mouse.up()
    }

    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })

  test('circle drawing on canvas does not throw errors', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-circle-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Circle Drawing Test')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await activateTool(page, 'Circle')

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 150, box.y + 150)
      await page.mouse.down()
      await page.mouse.move(box.x + 220, box.y + 220)
      await page.mouse.up()
    }

    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })

  test('keyboard shortcut B activates Freehand tool', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-key-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Drawing Keyboard Shortcut Test')

    // Press B to activate Freehand
    await page.keyboard.press('b')

    const freehandBtn = page.getByRole('button', { name: 'Freehand' })
    const bg = await freehandBtn.evaluate((el) => (el as HTMLElement).style.background)
    expect(bg).toContain('6366f1')
  })

  test('keyboard shortcut R activates Rectangle tool', async ({ page }) => {
    await registerAndLogin(page, `e2e-draw-key-rect-${timestamp}@test.com`, password, 'Drawing Tester')
    await createCampaignAndMap(page, 'Rectangle Keyboard Shortcut Test')

    await page.keyboard.press('r')

    const rectBtn = page.getByRole('button', { name: 'Rectangle' })
    const bg = await rectBtn.evaluate((el) => (el as HTMLElement).style.background)
    expect(bg).toContain('6366f1')
  })
})
