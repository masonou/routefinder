export const SEARCH_LOADING_MESSAGES = [
  "Looking for places you can fly direct to...",
  "Checking which stops work on your way...",
  "Comparing flexible departure dates...",
  "Looking for routes with simple flight legs...",
  "Comparing prices and journey times...",
] as const;

export const SEARCH_LOADING_STATUS_INTERVAL_MS = 3500;

type ScheduleInterval = (callback: () => void, delay: number) => number;
type CancelInterval = (intervalId: number) => void;

export function getNextSearchLoadingStatusIndex(currentIndex: number): number {
  return (currentIndex + 1) % SEARCH_LOADING_MESSAGES.length;
}

export function getSearchLoadingAnnouncement(origin: string, destination: string): string {
  return `Searching for routes from ${origin} to ${destination}. Results will appear when ready.`;
}

export function startSearchLoadingStatusRotation(
  onTick: () => void,
  schedule: ScheduleInterval = window.setInterval.bind(window),
  cancel: CancelInterval = window.clearInterval.bind(window),
): () => void {
  const intervalId = schedule(onTick, SEARCH_LOADING_STATUS_INTERVAL_MS);
  return () => cancel(intervalId);
}
