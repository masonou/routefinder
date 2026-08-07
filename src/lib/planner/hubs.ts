// Bangkok is deliberately the only hub. Adding hubs multiplies live API usage and cost.
export const SUPPORTED_HUB_CODES = ["BKK"] as const;

// Hub choice stays behind a function so future versions can consider route context.
export function getCandidateHubs(): string[] {
  return [...SUPPORTED_HUB_CODES];
}
