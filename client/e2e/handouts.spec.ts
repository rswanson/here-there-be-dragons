import { test, expect } from '@playwright/test'
import { registerAndLogin, createCampaign, navigateToCampaign } from './helpers'

const PASSWORD = 'testpassword123'

test.describe('Handouts (Docs Tab)', () => {
  test('DM creates a handout — editor opens with new handout', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-handout-create-${ts}@test.com`, PASSWORD, 'DM Handout')
    await createCampaign(page, `Handout Create Campaign ${ts}`)
    await navigateToCampaign(page, `Handout Create Campaign ${ts}`)

    // Switch to Docs tab
    await page.getByRole('tab', { name: 'Docs' }).click()

    // Wait for the docs tab content to render (the "Handouts" heading label)
    await expect(page.getByText('Handouts', { exact: true })).toBeVisible({ timeout: 5_000 })

    // DM should see the "+ New" button (campaign creator is DM)
    // Wait for presence/WS to settle so the role is recognised
    await expect(page.getByRole('button', { name: '+ New' })).toBeVisible({ timeout: 10_000 })

    // Click "+ New" to create a handout
    await page.getByRole('button', { name: '+ New' }).click()

    // The HandoutEditor opens — verify the title input shows "Untitled"
    await expect(page.getByRole('textbox', { name: 'Handout title' })).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByRole('textbox', { name: 'Handout title' })).toHaveValue('Untitled')
  })

  test('Docs tab shows handout list after creating a handout', async ({ page }) => {
    const ts = Date.now()
    await registerAndLogin(page, `e2e-handout-list-${ts}@test.com`, PASSWORD, 'DM List Tester')
    await createCampaign(page, `Handout List Campaign ${ts}`)
    await navigateToCampaign(page, `Handout List Campaign ${ts}`)

    // Switch to Docs tab
    await page.getByRole('tab', { name: 'Docs' }).click()
    await expect(page.getByText('Handouts', { exact: true })).toBeVisible({ timeout: 5_000 })

    // Wait for the DM role to be recognised via presence
    await expect(page.getByRole('button', { name: '+ New' })).toBeVisible({ timeout: 10_000 })

    // Create a handout
    await page.getByRole('button', { name: '+ New' }).click()

    // The HandoutEditor opens — verify the title input shows "Untitled"
    await expect(page.getByRole('textbox', { name: 'Handout title' })).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByRole('textbox', { name: 'Handout title' })).toHaveValue('Untitled')

    // Navigate back to the list view via the Back button in the editor
    await page.getByRole('button', { name: '← Back' }).click()

    // The handout should now appear in the list with a "DM Only" badge
    await expect(page.getByRole('button', { name: 'Untitled', exact: false })).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText('DM Only')).toBeVisible({ timeout: 5_000 })
  })
})
