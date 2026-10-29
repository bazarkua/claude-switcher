import { z } from 'zod'
import type { UsageSummary } from '../../shared/types'

const period = z.object({
  utilization: z.number().finite().min(0).max(100),
  resets_at: z.iso.datetime({ offset: true }).nullable(),
})
const payload = z.object({ five_hour: period.nullish(), seven_day: period.nullish() })
export const usageOrganizations = z
  .array(z.object({ uuid: z.uuid(), name: z.string().max(300).optional() }))
  .max(100)
export type UsageOrganization = z.infer<typeof usageOrganizations>[number]
export type UsageFetch = (
  profileId: string,
  path: string,
) => Promise<{
  status: number
  body: unknown
  retryAfter?: number
}>
export function parseUsage(value: unknown, organization: string, now: number): UsageSummary {
  const parsed = payload.safeParse(value)
  if (!parsed.success || (!parsed.data.five_hour && !parsed.data.seven_day))
    return { available: false, label: 'Claude returned no supported usage windows.' }
  const { five_hour: five, seven_day: week } = parsed.data
  return {
    available: true,
    fiveHourRemaining: five ? 100 - five.utilization : null,
    weeklyRemaining: week ? 100 - week.utilization : null,
    fiveHourResetAt: five?.resets_at ?? null,
    weeklyResetAt: week?.resets_at ?? null,
    organization,
    updatedAt: new Date(now).toISOString(),
  }
}
export class UsageMonitor {
  private cache = new Map<string, { value: UsageSummary; until: number }>()
  private pending = new Map<string, Promise<UsageSummary>>()
  constructor(
    private readonly fetch: UsageFetch,
    private readonly now = Date.now,
  ) {}
  clear(id: string): void {
    for (const key of this.cache.keys()) if (key.startsWith(`${id}/`)) this.cache.delete(key)
  }
  async snapshot(id: string, org?: UsageOrganization): Promise<UsageSummary> {
    if (!org) return { available: false, label: 'Connect usage in Settings → Usage.' }
    const key = `${id}/${org.uuid}`
    const cached = this.cache.get(key)
    if (cached && cached.until > this.now()) return cached.value
    const existing = this.pending.get(key)
    if (existing) return existing
    const operation = this.read(id, org, key)
    this.pending.set(key, operation)
    try {
      return await operation
    } finally {
      this.pending.delete(key)
    }
  }
  private async read(id: string, org: UsageOrganization, key: string): Promise<UsageSummary> {
    let value: UsageSummary
    let delay = 300_000
    try {
      const response = await this.fetch(id, `/api/organizations/${org.uuid}/usage`)
      if (response.status === 200)
        value = parseUsage(response.body, org.name || org.uuid, this.now())
      else if (response.status === 401 || response.status === 403)
        value = { available: false, label: 'Usage session expired or denied. Reconnect usage.' }
      else if (response.status === 429) {
        delay = Math.max(delay, Math.min(3_600_000, (response.retryAfter || 300) * 1000))
        value = { available: false, label: 'Claude rate limited usage. Retrying later.' }
      } else value = { available: false, label: 'Claude usage is temporarily unavailable.' }
    } catch {
      value = { available: false, label: 'Could not reach Claude usage. Retrying later.' }
    }
    this.cache.set(key, { value, until: this.now() + delay })
    return value
  }
}
