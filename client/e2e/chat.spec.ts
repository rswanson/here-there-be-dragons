import { test, expect } from '@playwright/test'
import { registerAndLogin, createCampaign, navigateToCampaign } from './helpers'

const PASSWORD = 'testpassword123'

/**
 * Wait for the WebSocket to be in "Connected" state before interacting with
 * features that depend on it (chat send, initiative, etc.).
 */
async function waitForConnected(page: Parameters<typeof navigateToCampaign>[0]): Promise<void> {
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 10_000 })
}

test.describe('Chat', () => {
  test('send and receive OOC message', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-chat-ooc-${ts}@test.com`, PASSWORD, 'Chat Tester')
    await createCampaign(page, `Chat OOC Campaign ${ts}`)
    await navigateToCampaign(page, `Chat OOC Campaign ${ts}`)

    // Wait for WebSocket to connect before interacting with chat
    await waitForConnected(page)

    // Switch to Chat tab
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByPlaceholder('Say something… /me /w /session')).toBeVisible({
      timeout: 5_000,
    })

    // Type and send an OOC message via the Send button
    const message = `Hello from OOC ${ts}`
    await page.getByPlaceholder('Say something… /me /w /session').fill(message)
    await page.getByRole('button', { name: 'Send' }).click()

    // Verify the message appears wrapped in OOC brackets
    await expect(page.getByText(`[${message}]`)).toBeVisible({ timeout: 15_000 })
  })

  test('character-attributed message shows character name', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(
      page,
      `e2e-chat-char-${ts}@test.com`,
      PASSWORD,
      'Char Chat Tester',
    )
    await createCampaign(page, `Chat Char Campaign ${ts}`)
    await navigateToCampaign(page, `Chat Char Campaign ${ts}`)

    // Wait for WebSocket to connect
    await waitForConnected(page)

    // Create a character first (navigate to Chars tab)
    await page.getByRole('tab', { name: 'Chars' }).click()
    await page.getByRole('button', { name: '+ New', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
    // Wait for the game system options to load before filling the name
    await expect(page.locator('#char-game-system option:not([value=""])')).toBeAttached({
      timeout: 5_000,
    })
    await page.locator('#char-name').fill('Gandalf')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

    // Switch to Chat tab
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByPlaceholder('Say something… /me /w /session')).toBeVisible({
      timeout: 5_000,
    })

    // Select the character from the dropdown
    const characterSelect = page.locator('select').first()
    await expect(characterSelect).toBeVisible({ timeout: 5_000 })
    await characterSelect.selectOption({ label: 'Gandalf' })

    // Send a message attributed to the character via the Send button
    const message = `You shall not pass! ${ts}`
    await page.getByPlaceholder('Say something… /me /w /session').fill(message)
    await page.getByRole('button', { name: 'Send' }).click()

    // Verify the message body appears in the chat
    await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 })

    // Verify the character name appears as the author label in the message bubble
    // Scope to the visible message content area (above the input bar) to avoid
    // matching the hidden <option> in the character select dropdown
    const msgContent = page.getByText(message)
    // The character name is a sibling/ancestor element; just check it's in the chat panel
    const chatPanel = page.getByRole('tabpanel', { name: 'Chat' })
    // Use locator filter to find a span containing 'Gandalf' that is visible
    await expect(
      chatPanel.locator('span').filter({ hasText: /^Gandalf$/ }).first(),
    ).toBeVisible({ timeout: 5_000 })
    // Also verify the message text is present
    await expect(msgContent).toBeVisible({ timeout: 5_000 })
  })
})
