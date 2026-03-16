import { expect, type Page } from '@playwright/test'

/**
 * Register a new user and land on the campaigns page.
 * Pass a custom displayName or fall back to a generic default.
 */
export async function registerAndLogin(
  page: Page,
  email: string,
  password: string,
  displayName = 'E2E Tester',
): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Display Name').fill(displayName)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })
}

/**
 * Log in with an existing account and land on the campaigns page.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })
}

/**
 * Create a campaign (assumes the page is already on /campaigns).
 */
export async function createCampaign(page: Page, name: string): Promise<void> {
  await page.getByPlaceholder('Campaign name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 5_000 })
}

/**
 * Click a campaign link and wait for the campaign page to load.
 */
export async function navigateToCampaign(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name }).click()
  await expect(page).toHaveURL(/\/campaigns\//, { timeout: 5_000 })
}

/**
 * Create a new map via the "+ New Map" button and wait for it to appear
 * in the map selector dropdown.
 */
export async function createMap(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ New Map' }).click()
  await expect(page.locator('#map-selector option:not([value=""])')).toBeAttached({
    timeout: 5_000,
  })
}

/**
 * Convenience: create a campaign, navigate to it, create a map, and
 * wait for the canvas to be visible. Combines createCampaign +
 * navigateToCampaign + createMap + canvas wait.
 */
export async function createCampaignAndMap(page: Page, campaignName: string): Promise<void> {
  await createCampaign(page, campaignName)
  await navigateToCampaign(page, campaignName)
  await createMap(page)
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 })
}

/**
 * Wait for the canvas element to be visible and allow extra time for
 * WebGL to finish its initial render pass.
 */
export async function waitForCanvasReady(page: Page): Promise<void> {
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(2000)
}

/**
 * Full setup: register, create a campaign with a map, and wait for the
 * canvas to be ready. Used by visual-regression and other heavy tests.
 */
export async function setupCampaignWithMap(
  page: Page,
  email: string,
  password: string,
  campaignName: string,
): Promise<void> {
  await registerAndLogin(page, email, password)
  await createCampaign(page, campaignName)
  await navigateToCampaign(page, campaignName)
  await createMap(page)
  await waitForCanvasReady(page)
}
