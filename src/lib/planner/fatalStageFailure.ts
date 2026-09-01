import type { NormalizedSearchApiError } from "../providers/searchApi.ts";

export type FatalSearchStage = "explore" | "calendar" | "detailed";

const stageLabels: Record<FatalSearchStage, string> = {
  explore: "Travel Explore",
  calendar: "Calendar validation",
  detailed: "Detailed verification",
};

// Carries already-redacted provider evidence across a fatal pipeline boundary.
// It is intentionally internal: the API layer decides what is safe to expose.
export class FatalSearchStageError extends Error {
  readonly stage: FatalSearchStage;
  readonly childFailures: readonly NormalizedSearchApiError[];

  constructor(stage: FatalSearchStage, childFailures: readonly NormalizedSearchApiError[]) {
    const subject = stage === "explore" ? "departure date" : "candidate";
    const firstCause = childFailures[0]?.message;
    super(
      `${stageLabels[stage]} failed for every ${subject}.${
        firstCause ? ` ${firstCause}` : ""
      }`,
    );
    this.name = "FatalSearchStageError";
    this.stage = stage;
    this.childFailures = childFailures;
  }
}
