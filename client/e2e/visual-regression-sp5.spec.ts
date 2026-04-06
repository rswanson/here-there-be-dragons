import { test, expect } from '@playwright/test'
import { setupCampaignWithMap } from './helpers'

test.describe('SP-5 Visual Regression', () => {
  const timestamp = Date.now()

  test('canvas renders with wall toolbar visible', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-vis-sp5-toolbar-${timestamp}@test.com`,
      'testpassword123',
      'SP5 Visual Toolbar',
    )
    // Wait for all UI to settle
    await page.waitForTimeout(1000)
    await expect(page.locator('canvas')).toHaveScreenshot('sp5-wall-toolbar.png', {
      maxDiffPixelRatio: 0.05,
    })
  })

  test('canvas renders with DM overlay panels', async ({ page }) => {
    await setupCampaignWithMap(
      page,
      `e2e-vis-sp5-panels-${timestamp}@test.com`,
      'testpassword123',
      'SP5 Visual Panels',
    )
    await page.waitForTimeout(1000)
    // Capture the full campaign view with all DM panels
    await expect(page).toHaveScreenshot('sp5-dm-panels.png', {
      maxDiffPixelRatio: 0.05,
    })
  })
})
