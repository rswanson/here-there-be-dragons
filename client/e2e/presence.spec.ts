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
// Tests
// ---------------------------------------------------------------------------

test.describe('Presence', () => {
  test('Players Online panel shows connected users', async ({ browser }) => {
    // DM creates campaign with map
    const dm = await freshContext(browser)
    await registerAndLogin(dm.page, `e2e-pres-dm-${timestamp}@test.com`, password, 'DM Presence')
    await createCampaign(dm.page, 'Presence Test Campaign')
    await navigateToCampaign(dm.page, 'Presence Test Campaign')

    const inviteCode = await getInviteCode(dm.page)
    await createMap(dm.page)
    await waitForCanvasReady(dm.page)

    // Player joins campaign and navigates to it
    const player = await freshContext(browser)
    await registerAndLogin(
      player.page,
      `e2e-pres-player-${timestamp}@test.com`,
      password,
      'Player Presence',
    )
    await joinCampaignViaCode(player.page, inviteCode)
    await player.page.goto('/campaigns')
    await navigateToCampaign(player.page, 'Presence Test Campaign')
    await selectFirstMap(player.page)
    await waitForCanvasReady(player.page)

    // Wait for presence updates to propagate
    await dm.page.waitForTimeout(3000)

    // DM should see PlayersOnline panel listing both users
    const dmPlayersPanel = dm.page.getByText('Players Online')
    await expect(dmPlayersPanel).toBeVisible({ timeout: 10_000 })

    // Both names should appear in the PlayersOnline panel
    const dmPanel = dm.page.locator('[data-testid="players-online"]')
    await expect(dmPanel.getByText('DM Presence')).toBeVisible({ timeout: 5_000 })
    await expect(dmPanel.getByText('Player Presence')).toBeVisible({ timeout: 5_000 })

    // Player should also see both users
    const playerPanel = player.page.locator('[data-testid="players-online"]')
    await expect(playerPanel).toBeVisible({ timeout: 10_000 })
    await expect(playerPanel.getByText('DM Presence')).toBeVisible({ timeout: 5_000 })
    await expect(playerPanel.getByText('Player Presence')).toBeVisible({ timeout: 5_000 })

    await dm.context.close()
    await player.context.close()
  })

  test('player list updates on disconnect', async ({ browser }) => {
    // DM creates campaign with map
    const dm = await freshContext(browser)
    await registerAndLogin(
      dm.page,
      `e2e-disc-dm-${timestamp}@test.com`,
      password,
      'DM Disconnect',
    )
    await createCampaign(dm.page, 'Disconnect Test Campaign')
    await navigateToCampaign(dm.page, 'Disconnect Test Campaign')

    const inviteCode = await getInviteCode(dm.page)
    await createMap(dm.page)
    await waitForCanvasReady(dm.page)

    // Player joins
    const player = await freshContext(browser)
    await registerAndLogin(
      player.page,
      `e2e-disc-player-${timestamp}@test.com`,
      password,
      'Player Disconnect',
    )
    await joinCampaignViaCode(player.page, inviteCode)
    await player.page.goto('/campaigns')
    await navigateToCampaign(player.page, 'Disconnect Test Campaign')
    await selectFirstMap(player.page)
    await waitForCanvasReady(player.page)

    // Wait for both to appear
    await dm.page.waitForTimeout(3000)
    const dmPanel = dm.page.locator('[data-testid="players-online"]')
    await expect(dmPanel.getByText('Player Disconnect')).toBeVisible({ timeout: 10_000 })

    // Player disconnects
    await player.page.close()
    await player.context.close()

    // DM should see the player disappear from the list
    await expect(dmPanel.getByText('Player Disconnect')).not.toBeVisible({ timeout: 15_000 })

    // DM should still be listed
    await expect(dmPanel.getByText('DM Disconnect')).toBeVisible({ timeout: 5_000 })

    await dm.context.close()
  })
})
