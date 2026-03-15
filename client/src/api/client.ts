const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (res.status === 401) {
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshRes.ok) {
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })
      if (!retryRes.ok) throw new ApiError(retryRes.status, await retryRes.text())
      return retryRes.json()
    }
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; display_name: string }) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
  },
  campaigns: {
    list: () => request('/campaigns'),
    create: (data: { name: string }) =>
      request('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/campaigns/${id}`),
    join: (inviteCode: string) =>
      request(`/campaigns/join/${inviteCode}`, { method: 'POST' }),
    members: (id: string) => request(`/campaigns/${id}/members`),
    removeMember: (campaignId: string, userId: string) =>
      request(`/campaigns/${campaignId}/members/${userId}`, { method: 'DELETE' }),
  },
  assets: {
    list: (campaignId: string, params?: { content_type?: string; limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams()
      if (params?.content_type) searchParams.set('content_type', params.content_type)
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))
      const qs = searchParams.toString()
      return request(`/assets/campaigns/${campaignId}${qs ? `?${qs}` : ''}`)
    },
    upload: async (campaignId: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE_URL}/assets/campaigns/${campaignId}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) throw new ApiError(res.status, await res.text())
      return res.json()
    },
    delete: (id: string) =>
      request(`/assets/${id}`, { method: 'DELETE' }),
    url: (id: string) => `${BASE_URL}/assets/${id}`,
  },
}
