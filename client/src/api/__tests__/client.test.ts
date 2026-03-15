import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError } from '../client'

describe('api client', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(data: unknown, status = 200) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    })
  }

  function noContentResponse() {
    return Promise.resolve({
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
      text: () => Promise.resolve(''),
    })
  }

  describe('auth.register', () => {
    it('posts registration data', async () => {
      const user = { id: '1', email: 'a@b.com', display_name: 'A', created_at: '' }
      mockFetch.mockReturnValue(jsonResponse({ user }))

      const result = await api.auth.register({
        email: 'a@b.com',
        password: 'password123',
        display_name: 'A',
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }))
      expect(result).toEqual({ user })
    })
  })

  describe('auth.login', () => {
    it('posts login data', async () => {
      const user = { id: '1', email: 'a@b.com', display_name: 'A', created_at: '' }
      mockFetch.mockReturnValue(jsonResponse({ user }))

      await api.auth.login({ email: 'a@b.com', password: 'pass' })

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }))
    })
  })

  describe('auth.logout', () => {
    it('posts to logout', async () => {
      mockFetch.mockReturnValue(noContentResponse())
      await api.auth.logout()

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }))
    })
  })

  describe('auth.me', () => {
    it('gets authenticated user', async () => {
      const user = { id: '1', email: 'a@b.com', display_name: 'A', created_at: '' }
      mockFetch.mockReturnValue(jsonResponse({ user }))

      const result = await api.auth.me()
      expect(result).toEqual({ user })
    })
  })

  describe('auto refresh on 401', () => {
    it('retries request after successful refresh', async () => {
      const user = { id: '1', email: 'a@b.com', display_name: 'A', created_at: '' }

      mockFetch
        // First call: /api/auth/me returns 401
        .mockReturnValueOnce(Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') }))
        // Second call: /api/auth/refresh succeeds
        .mockReturnValueOnce(Promise.resolve({ ok: true, status: 200 }))
        // Third call: retry /api/auth/me succeeds
        .mockReturnValueOnce(jsonResponse({ user }))

      const result = await api.auth.me()
      expect(result).toEqual({ user })
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('throws when refresh also fails', async () => {
      mockFetch
        .mockReturnValueOnce(Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') }))
        .mockReturnValueOnce(Promise.resolve({ ok: false, status: 401 }))

      await expect(api.auth.me()).rejects.toThrow('Session expired')
    })
  })

  describe('campaigns', () => {
    it('list fetches campaigns', async () => {
      const campaigns = [{ id: '1', name: 'Camp' }]
      mockFetch.mockReturnValue(jsonResponse(campaigns))

      const result = await api.campaigns.list()
      expect(result).toEqual(campaigns)
      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns', expect.objectContaining({
        credentials: 'include',
      }))
    })

    it('create posts campaign data', async () => {
      const campaign = { id: '1', name: 'New' }
      mockFetch.mockReturnValue(jsonResponse(campaign))

      await api.campaigns.create({ name: 'New' })
      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New' }),
      }))
    })

    it('get fetches a campaign by id', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: 'abc', name: 'Test' }))
      await api.campaigns.get('abc')
      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/abc', expect.anything())
    })

    it('join posts to invite code endpoint', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: '1' }))
      await api.campaigns.join('code123')
      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/join/code123', expect.objectContaining({
        method: 'POST',
      }))
    })

    it('members fetches campaign members', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))
      await api.campaigns.members('abc')
      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/abc/members', expect.anything())
    })

    it('removeMember deletes a member', async () => {
      mockFetch.mockReturnValue(noContentResponse())
      await api.campaigns.removeMember('camp1', 'user1')
      expect(mockFetch).toHaveBeenCalledWith('/api/campaigns/camp1/members/user1', expect.objectContaining({
        method: 'DELETE',
      }))
    })
  })

  describe('assets', () => {
    it('list fetches assets with optional filters', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))
      await api.assets.list('camp1', { content_type: 'image/%' })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/assets/campaigns/camp1?content_type=image%2F%25',
        expect.anything(),
      )
    })

    it('list without filters has no query string', async () => {
      mockFetch.mockReturnValue(jsonResponse([]))
      await api.assets.list('camp1')
      expect(mockFetch).toHaveBeenCalledWith('/api/assets/campaigns/camp1', expect.anything())
    })

    it('url returns correct asset path', () => {
      expect(api.assets.url('asset-id')).toBe('/api/assets/asset-id')
    })

    it('delete sends DELETE request', async () => {
      mockFetch.mockReturnValue(noContentResponse())
      await api.assets.delete('asset-id')
      expect(mockFetch).toHaveBeenCalledWith('/api/assets/asset-id', expect.objectContaining({
        method: 'DELETE',
      }))
    })

    it('upload sends multipart form data', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: 'new-asset' }, 201))

      const file = new File(['png'], 'test.png', { type: 'image/png' })
      await api.assets.upload('camp1', file)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/assets/campaigns/camp1',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )
      // Body should be FormData
      const call = mockFetch.mock.calls[0][1]
      expect(call.body).toBeInstanceOf(FormData)
    })
  })

  describe('error handling', () => {
    it('throws ApiError with status on non-401 failures', async () => {
      mockFetch.mockReturnValue(Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      }))

      try {
        await api.campaigns.list()
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).status).toBe(400)
      }
    })
  })
})
