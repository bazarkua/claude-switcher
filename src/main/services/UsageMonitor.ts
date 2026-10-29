// No documented quota interface is available to this local utility.
// This service deliberately performs no network calls or credential inspection.
export class UsageMonitor {
  snapshot(): { available: false; label: string } { return { available: false, label: 'Usage unavailable' } }
}
