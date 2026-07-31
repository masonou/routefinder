import { planTrip } from "@/lib/planner/planTrip";
import { mockFlightProvider } from "@/lib/providers/mockFlightProvider";
import type { Itinerary } from "@/types/itinerary";

// This helper gives us a small end-to-end example without wiring the planner into the UI yet.
export async function runPlannerExample(): Promise<Itinerary[]> {
  return planTrip(
    {
      origin: "BNE",
      destination: "LCA",
      departureWindow: {
        start: "2026-09-06",
        end: "2026-09-12",
      },
      arrivalWindow: {
        start: "2026-09-12",
        end: "2026-09-20",
      },
      adults: 1,
    },
    mockFlightProvider
  );
}
