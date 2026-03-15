import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Canvas & Map Loading', () => {
  // Unique user per test run to avoid conflicts
  const timestamp = Date.now()
  const email = `e2e-canvas-${timestamp}@test.com`
  const password = 'testpassword123'
  const displayName = 'E2E Canvas Tester'

  test('full flow: register → campaign → upload asset → set as map → verify canvas renders', async ({ page }) => {
    // Step 1: Register
    await page.goto('/register')
    await page.getByLabel('Display Name').fill(displayName)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Register' }).click()

    // Should redirect to campaigns page
    await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })

    // Step 2: Create a campaign
    await page.getByPlaceholder('Campaign name').fill('E2E Canvas Test')
    await page.getByRole('button', { name: 'Create' }).click()

    // Wait for campaign to appear in the list
    const campaignLink = page.getByRole('link', { name: 'E2E Canvas Test' })
    await expect(campaignLink).toBeVisible({ timeout: 5_000 })

    // Step 3: Navigate to the campaign
    await campaignLink.click()
    await expect(page).toHaveURL(/\/campaigns\//, { timeout: 5_000 })

    // Step 4: Wait for canvas to initialize (or show status)
    // Give PixiJS time to initialize
    await page.waitForTimeout(2000)

    // Check canvas state
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10_000 })

    // Sample pixels from the canvas BEFORE loading a map
    const pixelsBefore = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        // WebGL canvas — read via WebGL context
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        if (!gl) return null
        const pixels = new Uint8Array(4)
        // Read center pixel
        const x = Math.floor(canvas.width / 2)
        const y = Math.floor(canvas.height / 2)
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        return { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3], source: 'webgl' }
      }
      const imageData = ctx.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1, 1
      )
      return {
        r: imageData.data[0],
        g: imageData.data[1],
        b: imageData.data[2],
        a: imageData.data[3],
        source: '2d',
      }
    })

    // Log the canvas state for debugging
    console.log('Canvas pixels before map:', pixelsBefore)

    // Check if PixiJS initialized (look for status indicators)
    const initError = page.locator('text=Canvas failed to initialize')
    const initLoading = page.locator('text=Initializing canvas')
    const hasError = await initError.isVisible().catch(() => false)
    const isLoading = await initLoading.isVisible().catch(() => false)

    if (hasError) {
      const errorMsg = await page.locator('[style*="color"]').filter({ hasText: 'Canvas failed' }).textContent()
      console.log('PixiJS init error:', errorMsg)
    }
    if (isLoading) {
      console.log('PixiJS still loading after 2s — waiting more...')
      await page.waitForTimeout(5000)
    }

    // Take a screenshot of the canvas area before map load
    const canvasBefore = await canvas.screenshot()

    // Step 5: Open Asset Library and upload an image
    await page.getByRole('button', { name: 'Asset Library' }).click()
    await expect(page.getByText('Asset Library').first()).toBeVisible({ timeout: 5_000 })

    // Create a test PNG file (solid bright red 64x64)
    const testImagePath = path.join(__dirname, 'test-image.png')
    if (!fs.existsSync(testImagePath)) {
      // Create a minimal valid PNG programmatically via page
      const pngDataUrl = await page.evaluate(() => {
        const c = document.createElement('canvas')
        c.width = 64
        c.height = 64
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ff0000'
        ctx.fillRect(0, 0, 64, 64)
        // Add a distinctive pattern
        ctx.fillStyle = '#00ff00'
        ctx.fillRect(16, 16, 32, 32)
        return c.toDataURL('image/png')
      })
      const base64 = pngDataUrl.split(',')[1]
      fs.writeFileSync(testImagePath, Buffer.from(base64, 'base64'))
    }

    // Upload the file via the file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testImagePath)

    // Wait for upload to complete — the asset should appear in the grid
    const assetImage = page.locator('img[alt="test-image.png"]')
    await expect(assetImage).toBeVisible({ timeout: 10_000 })

    // Step 6: Click "Set as Map"
    await page.getByRole('button', { name: /Set.*as Map/i }).click()

    // The dialog should close (check for the drop zone text, unique to the dialog)
    await expect(page.getByText('Drag and drop files here')).not.toBeVisible({ timeout: 5_000 })

    // Step 7: Wait for the map to render on the canvas
    await page.waitForTimeout(3000)

    // Take a screenshot of the canvas area after map load
    const canvasAfter = await canvas.screenshot()

    // Step 8: Verify the canvas changed
    // Compare screenshots — they should be different if the map rendered
    const beforeBytes = canvasBefore
    const afterBytes = canvasAfter
    const screenshotsAreDifferent = !beforeBytes.equals(afterBytes)

    console.log('Canvas screenshot before size:', beforeBytes.length)
    console.log('Canvas screenshot after size:', afterBytes.length)
    console.log('Screenshots are different:', screenshotsAreDifferent)

    // Also check canvas pixel data directly
    const pixelsAfter = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return null

      // Try reading pixels from the WebGL context
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (gl) {
        const pixels = new Uint8Array(4)
        const x = Math.floor(canvas.width / 2)
        const y = Math.floor(canvas.height / 2)
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        return { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3], source: 'webgl' }
      }

      return null
    })

    console.log('Canvas pixels after map:', pixelsAfter)

    // The test passes if EITHER:
    // 1. The screenshots are visually different (map rendered), OR
    // 2. The pixel data changed from the background color
    //
    // Background color is #1a1a2e = rgb(26, 26, 46)
    const bgColor = { r: 26, g: 26, b: 46 }

    if (pixelsAfter && pixelsAfter.source === 'webgl') {
      const pixelChanged = (
        pixelsAfter.r !== bgColor.r ||
        pixelsAfter.g !== bgColor.g ||
        pixelsAfter.b !== bgColor.b
      )
      console.log('Center pixel changed from background:', pixelChanged)

      // Assert that either the screenshot changed or pixels changed
      expect(
        screenshotsAreDifferent || pixelChanged,
        'Canvas should show the uploaded map image — neither screenshot nor pixel data changed'
      ).toBe(true)
    } else {
      // Fall back to screenshot comparison only
      expect(
        screenshotsAreDifferent,
        'Canvas screenshot should change after setting a map'
      ).toBe(true)
    }

    // Cleanup test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath)
    }
  })

  test('canvas shows status indicator while loading', async ({ page }) => {
    // Register and create campaign via API for speed
    await page.goto('/register')
    await page.getByLabel('Display Name').fill(`Status-${timestamp}`)
    await page.getByLabel('Email').fill(`e2e-status-${timestamp}@test.com`)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })

    await page.getByPlaceholder('Campaign name').fill('Status Test Campaign')
    await page.getByRole('button', { name: 'Create' }).click()
    const link = page.getByRole('link', { name: 'Status Test Campaign' })
    await expect(link).toBeVisible({ timeout: 5_000 })
    await link.click()

    // On the campaign page, we should see one of:
    // - "Initializing canvas..." (loading)
    // - A visible canvas (ready)
    // - "Canvas failed to initialize" (error)
    // Any of these is acceptable — the point is we have feedback, not a blank/hung page
    await page.waitForTimeout(1000)

    const canvas = page.locator('canvas')
    const loadingText = page.getByText('Initializing canvas')
    const errorText = page.getByText('Canvas failed to initialize')

    const canvasVisible = await canvas.isVisible().catch(() => false)
    const loadingVisible = await loadingText.isVisible().catch(() => false)
    const errorVisible = await errorText.isVisible().catch(() => false)

    console.log('Canvas visible:', canvasVisible)
    console.log('Loading indicator:', loadingVisible)
    console.log('Error indicator:', errorVisible)

    // At least one status indicator should be present
    expect(
      canvasVisible || loadingVisible || errorVisible,
      'Campaign page should show canvas, loading state, or error — not a blank page'
    ).toBe(true)
  })

  test('asset browser opens and shows upload area', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Display Name').fill(`Browser-${timestamp}`)
    await page.getByLabel('Email').fill(`e2e-browser-${timestamp}@test.com`)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page).toHaveURL(/\/campaigns/, { timeout: 10_000 })

    await page.getByPlaceholder('Campaign name').fill('Browser Test Campaign')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByRole('link', { name: 'Browser Test Campaign' }).click()
    await expect(page).toHaveURL(/\/campaigns\//, { timeout: 5_000 })

    // Open asset browser
    await page.getByRole('button', { name: 'Asset Library' }).click()

    // Verify dialog opened with expected elements
    await expect(page.getByText('Asset Library').first()).toBeVisible()
    await expect(page.getByText('Drag and drop files here')).toBeVisible()

    // Filter buttons should be present
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Maps' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'PDFs' })).toBeVisible()

    // Close button should work
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Drag and drop files here')).not.toBeVisible()
  })
})
