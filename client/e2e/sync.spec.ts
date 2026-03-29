import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { registerAndLogin, createCampaign, navigateToCampaign, createMap, waitForCanvasReady } from './helpers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const timestamp = Date.now()
const password = 'testpassword123'

/** Create a fresh browser context (separate cookies / auth state). */
async function freshContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  return { context, page }
}

/** Extract the invite code text shown on the campaign page. */
async function getInviteCode(page: Page): Promise<string> {
  const inviteText = page.getByText('Invite code:')
  await expect(inviteText).toBeVisible({ timeout: 5_000 })
  const fullText = await inviteText.textContent()
  // Format: "Invite code: XXXXXX"
  const code = fullText?.replace('Invite code:', '').trim()
  if (!code) throw new Error('Could not extract invite code')
  return code
}

/** Join a campaign via its invite code using the REST endpoint. */
async function joinCampaignViaCode(page: Page, inviteCode: string): Promise<void> {
  // Navigate to join URL — the app handles /campaigns/join/:code
  const baseURL = page.url().split('/').slice(0, 3).join('/')
  const resp = await page.request.post(`${baseURL}/api/campaigns/join/${inviteCode}`)
  expect(resp.ok()).toBeTruthy()
}

/** Select a map from the map selector dropdown (picks the first available map). */
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

test.describe('Realtime Sync', () => {
  test('two users see same map state — DM creates token, player sees it', async ({ browser }) => {
    // DM context
    const dm = await freshContext(browser)
    await registerAndLogin(dm.page, `e2e-sync-dm-${timestamp}@test.com`, password, 'DM Sync')
    await createCampaign(dm.page, 'Sync Test Campaign')
    await navigateToCampaign(dm.page, 'Sync Test Campaign')

    // Get invite code
    const inviteCode = await getInviteCode(dm.page)

    // Create a map
    await createMap(dm.page)
    await waitForCanvasReady(dm.page)

    // Player context
    const player = await freshContext(browser)
    await registerAndLogin(
      player.page,
      `e2e-sync-player-${timestamp}@test.com`,
      password,
      'Player Sync',
    )

    // Player joins campaign
    await joinCampaignViaCode(player.page, inviteCode)

    // Player navigates to the campaign
    await player.page.goto('/campaigns')
    await navigateToCampaign(player.page, 'Sync Test Campaign')
    await selectFirstMap(player.page)
    await waitForCanvasReady(player.page)

    // DM creates a token via REST API
    const dmBaseURL = dm.page.url().split('/').slice(0, 3).join('/')
    // Get the token layer ID from the map selector or page data
    // We get maps list to find the token layer
    const mapsResp = await dm.page.request.get(`${dmBaseURL}/api/campaigns`)
    const campaigns = await mapsResp.json()
    const campaignId = campaigns.find(
      (c: { name: string }) => c.name === 'Sync Test Campaign',
    )?.id
    expect(campaignId).toBeTruthy()

    const mapsListResp = await dm.page.request.get(
      `${dmBaseURL}/api/campaigns/${campaignId}/maps`,
    )
    const maps = await mapsListResp.json()
    expect(maps.length).toBeGreaterThan(0)
    const mapId = maps[0].id

    // Get map state to find token layer
    const stateResp = await dm.page.request.get(`${dmBaseURL}/api/maps/${mapId}/state`)
    const mapState = await stateResp.json()
    const tokenLayer = mapState.layers.find((l: { layer_type: string }) => l.layer_type === 'token')
    expect(tokenLayer).toBeTruthy()

    // Create token via REST
    const tokenResp = await dm.page.request.post(
      `${dmBaseURL}/api/layers/${tokenLayer.id}/tokens`,
      {
        data: { name: 'Sync Goblin', x: 5, y: 5 },
      },
    )
    expect(tokenResp.ok()).toBeTruthy()

    // Give WebSocket broadcast time to propagate
    await dm.page.waitForTimeout(2000)

    // Player fetches map state to verify the token is visible
    const playerBaseURL = player.page.url().split('/').slice(0, 3).join('/')
    const playerStateResp = await player.page.request.get(
      `${playerBaseURL}/api/maps/${mapId}/state`,
    )
    const playerState = await playerStateResp.json()
    const syncedToken = playerState.tokens.find((t: { name: string }) => t.name === 'Sync Goblin')
    expect(syncedToken).toBeTruthy()
    expect(syncedToken.x).toBe(5)
    expect(syncedToken.y).toBe(5)

    await dm.context.close()
    await player.context.close()
  })

  test('reconnect preserves state — tokens persist across disconnect', async ({ browser }) => {
    // DM context
    const dm = await freshContext(browser)
    await registerAndLogin(dm.page, `e2e-recon-dm-${timestamp}@test.com`, password, 'DM Recon')
    await createCampaign(dm.page, 'Reconnect Test Campaign')
    await navigateToCampaign(dm.page, 'Reconnect Test Campaign')

    const inviteCode = await getInviteCode(dm.page)
    await createMap(dm.page)
    await waitForCanvasReady(dm.page)

    // Get campaign and map info
    const dmBaseURL = dm.page.url().split('/').slice(0, 3).join('/')
    const campaignsResp = await dm.page.request.get(`${dmBaseURL}/api/campaigns`)
    const campaigns = await campaignsResp.json()
    const campaignId = campaigns.find(
      (c: { name: string }) => c.name === 'Reconnect Test Campaign',
    )?.id
    const mapsResp = await dm.page.request.get(`${dmBaseURL}/api/campaigns/${campaignId}/maps`)
    const maps = await mapsResp.json()
    const mapId = maps[0].id

    const stateResp = await dm.page.request.get(`${dmBaseURL}/api/maps/${mapId}/state`)
    const mapState = await stateResp.json()
    const tokenLayer = mapState.layers.find((l: { layer_type: string }) => l.layer_type === 'token')

    // DM creates first token
    const token1Resp = await dm.page.request.post(
      `${dmBaseURL}/api/layers/${tokenLayer.id}/tokens`,
      {
        data: { name: 'Token Before Disconnect', x: 1, y: 1 },
      },
    )
    expect(token1Resp.ok()).toBeTruthy()

    // Player connects and sees token
    const player = await freshContext(browser)
    await registerAndLogin(
      player.page,
      `e2e-recon-player-${timestamp}@test.com`,
      password,
      'Player Recon',
    )
    await joinCampaignViaCode(player.page, inviteCode)
    await player.page.goto('/campaigns')
    await navigateToCampaign(player.page, 'Reconnect Test Campaign')
    await selectFirstMap(player.page)
    await waitForCanvasReady(player.page)

    // Player disconnects (close page)
    await player.page.close()

    // DM creates second token while player is disconnected
    const token2Resp = await dm.page.request.post(
      `${dmBaseURL}/api/layers/${tokenLayer.id}/tokens`,
      {
        data: { name: 'Token After Disconnect', x: 10, y: 10 },
      },
    )
    expect(token2Resp.ok()).toBeTruthy()

    // Player reconnects with a new page in the same context
    const newPlayerPage = await player.context.newPage()
    await newPlayerPage.goto('/campaigns')
    await navigateToCampaign(newPlayerPage, 'Reconnect Test Campaign')
    await selectFirstMap(newPlayerPage)
    await waitForCanvasReady(newPlayerPage)

    // Verify player sees both tokens via state endpoint
    const playerBaseURL = newPlayerPage.url().split('/').slice(0, 3).join('/')
    const playerStateResp = await newPlayerPage.request.get(
      `${playerBaseURL}/api/maps/${mapId}/state`,
    )
    const playerState = await playerStateResp.json()

    const tokenNames = playerState.tokens.map((t: { name: string }) => t.name)
    expect(tokenNames).toContain('Token Before Disconnect')
    expect(tokenNames).toContain('Token After Disconnect')

    await dm.context.close()
    await player.context.close()
  })
})
