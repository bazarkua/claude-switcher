// No documented quota interface is available to this local utility.
// This service deliberately performs no network calls or credential inspection.
import type { UsageSummary } from '../../shared/types'
export class UsageMonitor {
  snapshot(): UsageSummary {
    return { available: false, label: 'Usage unavailable' }
  }
}
