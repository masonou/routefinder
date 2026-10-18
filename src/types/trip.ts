// Inclusive date range expressed as ISO calendar dates in YYYY-MM-DD format.
export interface DateWindow {
  start: string;
  end: string;
}

export interface TripRequest {
  origin: string;
  destination: string;
  // Controls when the first flight is allowed to depart.
  departureWindow: DateWindow;
  /** Destination-local calendar date by whose end the final flight must arrive. */
  arriveByDate?: string;
  adults?: number;
}
