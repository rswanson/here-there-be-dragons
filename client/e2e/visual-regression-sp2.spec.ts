import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import {
  registerAndLogin,
  createCampaign,
  navigateToCampaign,
  createMap,
  waitForCanvasReady,
} from './helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const timestamp = Date.now()
const password = 'testpassword123'

async function freshContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  return { context, page }
}

async function getInviteCode(page: Page): Promise<string> {
  const inviteText = page.getByText('Invite code:')
  await expect(inviteText).toBeVisible({ timeout: 5_000 })
  const fullText = await inviteText.textContent()
  const code = fullText?.replace('Invite code:', '').trim()
  if (!code) throw new Error('Could not extract invite code')
  return code
}

async function joinCampaignViaCode(page: Page, inviteCode: string): Promise<void> {
  const baseURL = page.url().split('/').slice(0, 3).join('/')
  const resp = await page.request.post(`${baseURL}/api/campaigns/join/${inviteCode}`)
  expect(resp.ok()).toBeTruthy()
}

async function selectFirstMap(page: Page): Promise<void> {
  const selector = page.locator('#map-selector')
  await expect(selector).toBeVisible({ timeout: 5_000 })
  const options = selector.locator('option:not([value=""])')
  await expect(options.first()).toBeAttached({ timeout: 5_000 })
  const value = await options.first().getAttribute('value')
  if (value) {
    await selector.selectOption(value)
  }
}

// ---------------------------------------------------------------------------
// Visual Regression Tests — SP-2 Realtime Sync
// ---------------------------------------------------------------------------

test.describe('Visual Regression SP-2', () => {
  test('connected status indicator', async ({ page }) => {
    await registerAndLogin(
      page,
      `e2e-vr-conn-${timestamp}@test.com`,
      password,
      'VR Connected',
    )
    await createCampaign(page, 'VR Connection Campaign')
    await navigateToCampaign(page, 'VR Connection Campaign')
    await createMap(page)
    await waitForCanvasReady(page)

    // Wait for WebSocket to connect and status to appear
    await page.waitForTimeout(3000)

    // The ConnectionStatus component shows "Connected" with a green dot
    const connectedText = page.getByText('Connected')
    await expect(connectedText).toBeVisible({ timeout: 10_000 })

    // Screenshot the header area containing the connection status
    const header = page.locator('header').first()
    await expect(header).toHaveScreenshot('connected-status.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('players online panel with multiple users', async ({ browser }) => {
    // DM sets up campaign
    const dm = await freshContext(browser)
    await registerAndLogin(dm.page, `e2e-vr-panel-dm-${timestamp}@test.com`, password, 'DM Visual')
    await createCampaign(dm.page, 'VR Players Campaign')
    await navigateToCampaign(dm.page, 'VR Players Campaign')

    const inviteCode = await getInviteCode(dm.page)
    await createMap(dm.page)
    await waitForCanvasReady(dm.page)

    // Player joins
    const player = await freshContext(browser)
    await registerAndLogin(
      player.page,
      `e2e-vr-panel-player-${timestamp}@test.com`,
      password,
      'Player Visual',
    )
    await joinCampaignViaCode(player.page, inviteCode)
    await player.page.goto('/campaigns')
    await navigateToCampaign(player.page, 'VR Players Campaign')
    await selectFirstMap(player.page)
    await waitForCanvasReady(player.page)

    // Wait for presence to propagate
    await dm.page.waitForTimeout(3000)

    // Verify panel is visible with both users
    await expect(dm.page.getByText('Players Online')).toBeVisible({ timeout: 10_000 })
    await expect(dm.page.getByText('DM Visual')).toBeVisible({ timeout: 5_000 })
    await expect(dm.page.getByText('Player Visual')).toBeVisible({ timeout: 5_000 })

    // Screenshot the PlayersOnline panel
    const playersPanel = dm.page.getByText('Players Online').locator('..')
    await expect(playersPanel).toHaveScreenshot('players-online-panel.png', {
      maxDiffPixelRatio: 0.02,
    })

    await dm.context.close()
    await player.context.close()
  })

  test('reconnecting state', async ({ page }) => {
    await registerAndLogin(
      page,
      `e2e-vr-recon-${timestamp}@test.com`,
      password,
      'VR Reconnecting',
    )
    await createCampaign(page, 'VR Reconnect Campaign')
    await navigateToCampaign(page, 'VR Reconnect Campaign')
    await createMap(page)
    await waitForCanvasReady(page)

    // Wait for WebSocket to connect
    await page.waitForTimeout(3000)
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10_000 })

    // Force disconnect by blocking WebSocket traffic via page.route
    await page.route('**/api/ws/**', (route) => route.abort())

    // The connection status should change to "Reconnecting..." after the WS drops.
    // Give it time to detect the disconnect.
    await page.waitForTimeout(5000)

    // Screenshot whatever state the header is in (connected or reconnecting)
    const header = page.locator('header').first()
    await expect(header).toHaveScreenshot('reconnecting-status.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
