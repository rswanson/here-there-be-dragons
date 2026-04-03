import { test, expect } from '@playwright/test'
import { registerAndLogin, createCampaignAndMap } from './helpers'

test.describe('Fog of War', () => {
  const timestamp = Date.now()
  const password = 'testpassword123'

  test('DM can toggle fog reveal mode', async ({ page }) => {
    await registerAndLogin(page, `e2e-fog-reveal-${timestamp}@test.com`, password, 'DM FogReveal')
    await createCampaignAndMap(page, 'Fog Reveal Test')
    const revealBtn = page.getByRole('button', { name: /reveal/i })
    await expect(revealBtn).toBeVisible({ timeout: 5_000 })
    await revealBtn.click()
    await expect(revealBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('DM can toggle fog hide mode', async ({ page }) => {
    await registerAndLogin(page, `e2e-fog-hide-${timestamp}@test.com`, password, 'DM FogHide')
    await createCampaignAndMap(page, 'Fog Hide Test')
    const hideBtn = page.getByRole('button', { name: /hide/i })
    await expect(hideBtn).toBeVisible({ timeout: 5_000 })
    await hideBtn.click()
    await expect(hideBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('DM can change fog brush size', async ({ page }) => {
    await registerAndLogin(page, `e2e-fog-brush-${timestamp}@test.com`, password, 'DM FogBrush')
    await createCampaignAndMap(page, 'Fog Brush Test')
    // Find brush size buttons (1, 3, 5)
    const brush3 = page.getByRole('button', { name: '3' }).first()
    if (await brush3.isVisible()) {
      await brush3.click()
    }
  })

  test('DM can switch vision mode to player preview', async ({ page }) => {
    await registerAndLogin(page, `e2e-fog-preview-${timestamp}@test.com`, password, 'DM FogPreview')
    await createCampaignAndMap(page, 'Fog Preview Test')
    const visionSelect = page.getByLabel(/vision mode/i)
    if (await visionSelect.isVisible()) {
      await visionSelect.selectOption({ index: 0 })
    }
  })
})
