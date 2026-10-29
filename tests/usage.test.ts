import { describe, it, expect, vi } from 'vitest'
import { UsageMonitor, parseUsage } from '../src/main/services/UsageMonitor'
const org = { uuid: '123e4567-e89b-42d3-a456-426614174000', name: 'Personal' }
const now = Date.parse('2026-10-28T12:00:00Z')
const body = {
  five_hour: { utilization: 23.5, resets_at: '2026-10-28T16:00:00Z' },
  seven_day: { utilization: 81, resets_at: '2026-11-01T12:00:00Z' },
}
describe('subscription usage', () => {
  it('converts server utilization into remaining quota and preserves reset windows', () => {
    expect(parseUsage(body, 'Personal', now)).toEqual({
      available: true,
      fiveHourRemaining: 76.5,
      weeklyRemaining: 19,
      fiveHourResetAt: body.five_hour.resets_at,
      weeklyResetAt: body.seven_day.resets_at,
      organization: 'Personal',
      updatedAt: '2026-10-28T12:00:00.000Z',
    })
  })
  it('never treats absent windows as full quota, and rejects malformed percentages and dates', () => {
    expect(parseUsage({ five_hour: null, seven_day: null }, 'Personal', now).available).toBe(false)
    expect(
      parseUsage({ five_hour: { utilization: 101, resets_at: null } }, 'Personal', now).available,
    ).toBe(false)
    expect(
      parseUsage({ five_hour: { utilization: 5, resets_at: 'later' } }, 'Personal', now).available,
    ).toBe(false)
    expect(
      parseUsage({ five_hour: body.five_hour, seven_day: null }, 'Personal', now),
    ).toMatchObject({ available: true, weeklyRemaining: null, weeklyResetAt: null })
  })
  it('isolates account caches, coalesces concurrent requests, and refreshes after five minutes', async () => {
    let clock = now
    const fetch = vi.fn(async (id: string) => ({
      status: 200,
      body: id === 'a' ? body : { ...body, five_hour: { ...body.five_hour, utilization: 99 } },
    }))
    const monitor = new UsageMonitor(fetch, () => clock)
    const [a, same] = await Promise.all([monitor.snapshot('a', org), monitor.snapshot('a', org)])
    expect(a).toEqual(same)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await monitor.snapshot('b', org)).toMatchObject({ fiveHourRemaining: 1 })
    await monitor.snapshot('a', org)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 300_001
    await monitor.snapshot('a', org)
    expect(fetch).toHaveBeenCalledTimes(3)
    monitor.clear('a')
    await monitor.snapshot('a', org)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('honors rate-limit backoff and discards old percentages on errors', async () => {
    let clock = now
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body })
      .mockResolvedValue({ status: 429, body: null, retryAfter: 900 })
    const monitor = new UsageMonitor(fetch, () => clock)
    expect((await monitor.snapshot('a', org)).available).toBe(true)
    clock += 300_001
    expect(await monitor.snapshot('a', org)).toMatchObject({
      available: false,
      label: expect.stringContaining('rate limited'),
    })
    clock += 300_001
    await monitor.snapshot('a', org)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += 600_000
    await monitor.snapshot('a', org)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it.each([401, 403, 500])('reports HTTP %i without leaking response content', async (status) => {
    const monitor = new UsageMonitor(async () => ({
      status,
      body: { secret: 'must-stay-private' },
    }))
    const result = await monitor.snapshot('a', org)
    expect(result.available).toBe(false)
    expect(JSON.stringify(result)).not.toContain('must-stay-private')
  })
  it('reports network failures and never contacts an unconnected account', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('private response')
    })
    const monitor = new UsageMonitor(fetch)
    expect((await monitor.snapshot('a')).available).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(await monitor.snapshot('a', org)).toMatchObject({
      available: false,
      label: expect.stringContaining('Could not reach'),
    })
  })
})
