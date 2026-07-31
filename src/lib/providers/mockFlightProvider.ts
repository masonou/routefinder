import type { FlightOffer } from "@/types/flight";
import type { DateWindow } from "@/types/trip";

import type { FlightProvider, FlightSearchInput } from "./types";

// Static fictional offers let us exercise planner behaviour before any live integration exists.
const MOCK_OFFERS: FlightOffer[] = [
  {
    id: "mock-bne-bkk-100",
    provider: "mock",
    origin: "BNE",
    destination: "BKK",
    departureAt: "2026-09-06T10:00:00.000Z",
    arrivalAt: "2026-09-06T19:30:00.000Z",
    durationMinutes: 570,
    stops: 0,
    segments: [
      {
        origin: "BNE",
        destination: "BKK",
        departureAt: "2026-09-06T10:00:00.000Z",
        arrivalAt: "2026-09-06T19:30:00.000Z",
        airlineName: "Coral Skies",
        airlineCode: "CS",
        flightNumber: "CS101",
      },
    ],
    indicativePrice: { amount: 420, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bne-bkk-100",
  },
  {
    id: "mock-bne-bkk-200",
    provider: "mock",
    origin: "BNE",
    destination: "BKK",
    departureAt: "2026-09-08T08:00:00.000Z",
    arrivalAt: "2026-09-08T17:45:00.000Z",
    durationMinutes: 585,
    stops: 1,
    segments: [
      {
        origin: "BNE",
        destination: "SIN",
        departureAt: "2026-09-08T08:00:00.000Z",
        arrivalAt: "2026-09-08T14:10:00.000Z",
        airlineName: "Coral Skies",
        airlineCode: "CS",
        flightNumber: "CS220",
      },
      {
        origin: "SIN",
        destination: "BKK",
        departureAt: "2026-09-08T15:20:00.000Z",
        arrivalAt: "2026-09-08T17:45:00.000Z",
        airlineName: "Tiger Bay Air",
        airlineCode: "TB",
        flightNumber: "TB872",
      },
    ],
    indicativePrice: { amount: 360, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bne-bkk-200",
  },
  {
    id: "mock-bne-bkk-999",
    provider: "mock",
    origin: "BNE",
    destination: "BKK",
    departureAt: "2026-09-10T05:00:00.000Z",
    arrivalAt: "2026-09-12T05:00:00.000Z",
    durationMinutes: 2880,
    stops: 4,
    segments: [
      {
        origin: "BNE",
        destination: "MNL",
        departureAt: "2026-09-10T05:00:00.000Z",
        arrivalAt: "2026-09-10T13:00:00.000Z",
        airlineName: "Lagoon Air",
        airlineCode: "LG",
        flightNumber: "LG410",
      },
      {
        origin: "MNL",
        destination: "HAN",
        departureAt: "2026-09-10T20:00:00.000Z",
        arrivalAt: "2026-09-11T00:30:00.000Z",
        airlineName: "Lagoon Air",
        airlineCode: "LG",
        flightNumber: "LG522",
      },
      {
        origin: "HAN",
        destination: "CNX",
        departureAt: "2026-09-11T12:00:00.000Z",
        arrivalAt: "2026-09-11T14:00:00.000Z",
        airlineName: "Frontier Isles",
        airlineCode: "FI",
        flightNumber: "FI93",
      },
      {
        origin: "CNX",
        destination: "DMK",
        departureAt: "2026-09-11T22:00:00.000Z",
        arrivalAt: "2026-09-11T23:15:00.000Z",
        airlineName: "Frontier Isles",
        airlineCode: "FI",
        flightNumber: "FI117",
      },
      {
        origin: "DMK",
        destination: "BKK",
        departureAt: "2026-09-12T03:30:00.000Z",
        arrivalAt: "2026-09-12T05:00:00.000Z",
        airlineName: "MetroJet",
        airlineCode: "MJ",
        flightNumber: "MJ12",
      },
    ],
    indicativePrice: { amount: 250, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bne-bkk-999",
  },
  {
    id: "mock-bkk-lca-0907",
    provider: "mock",
    origin: "BKK",
    destination: "LCA",
    departureAt: "2026-09-07T08:00:00.000Z",
    arrivalAt: "2026-09-07T18:00:00.000Z",
    durationMinutes: 600,
    stops: 0,
    segments: [
      {
        origin: "BKK",
        destination: "LCA",
        departureAt: "2026-09-07T08:00:00.000Z",
        arrivalAt: "2026-09-07T18:00:00.000Z",
        airlineName: "Mediterranean Connect",
        airlineCode: "MC",
        flightNumber: "MC401",
      },
    ],
    indicativePrice: { amount: 410, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bkk-lca-0907",
  },
  {
    id: "mock-bkk-lca-0908",
    provider: "mock",
    origin: "BKK",
    destination: "LCA",
    departureAt: "2026-09-08T09:00:00.000Z",
    arrivalAt: "2026-09-08T18:00:00.000Z",
    durationMinutes: 540,
    stops: 0,
    segments: [
      {
        origin: "BKK",
        destination: "LCA",
        departureAt: "2026-09-08T09:00:00.000Z",
        arrivalAt: "2026-09-08T18:00:00.000Z",
        airlineName: "Mediterranean Connect",
        airlineCode: "MC",
        flightNumber: "MC405",
      },
    ],
    indicativePrice: { amount: 390, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bkk-lca-0908",
  },
  {
    id: "mock-bkk-lca-0911",
    provider: "mock",
    origin: "BKK",
    destination: "LCA",
    departureAt: "2026-09-11T11:00:00.000Z",
    arrivalAt: "2026-09-12T00:30:00.000Z",
    durationMinutes: 810,
    stops: 1,
    segments: [
      {
        origin: "BKK",
        destination: "DOH",
        departureAt: "2026-09-11T11:00:00.000Z",
        arrivalAt: "2026-09-11T18:10:00.000Z",
        airlineName: "Andaman Air",
        airlineCode: "AA",
        flightNumber: "AA717",
      },
      {
        origin: "DOH",
        destination: "LCA",
        departureAt: "2026-09-11T20:30:00.000Z",
        arrivalAt: "2026-09-12T00:30:00.000Z",
        airlineName: "Mediterranean Connect",
        airlineCode: "MC",
        flightNumber: "MC908",
      },
    ],
    indicativePrice: { amount: 340, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bkk-lca-0911",
  },
  {
    id: "mock-bkk-lca-0912",
    provider: "mock",
    origin: "BKK",
    destination: "LCA",
    departureAt: "2026-09-12T06:00:00.000Z",
    arrivalAt: "2026-09-12T18:00:00.000Z",
    durationMinutes: 720,
    stops: 4,
    segments: [
      {
        origin: "BKK",
        destination: "BOM",
        departureAt: "2026-09-12T06:00:00.000Z",
        arrivalAt: "2026-09-12T09:15:00.000Z",
        airlineName: "Andaman Air",
        airlineCode: "AA",
        flightNumber: "AA301",
      },
      {
        origin: "BOM",
        destination: "AUH",
        departureAt: "2026-09-12T10:45:00.000Z",
        arrivalAt: "2026-09-12T12:45:00.000Z",
        airlineName: "Desert Horizon",
        airlineCode: "DH",
        flightNumber: "DH442",
      },
      {
        origin: "AUH",
        destination: "CAI",
        departureAt: "2026-09-12T13:45:00.000Z",
        arrivalAt: "2026-09-12T16:00:00.000Z",
        airlineName: "Desert Horizon",
        airlineCode: "DH",
        flightNumber: "DH510",
      },
      {
        origin: "CAI",
        destination: "ATH",
        departureAt: "2026-09-12T16:35:00.000Z",
        arrivalAt: "2026-09-12T17:20:00.000Z",
        airlineName: "Aegean Atlas",
        airlineCode: "AG",
        flightNumber: "AG88",
      },
      {
        origin: "ATH",
        destination: "LCA",
        departureAt: "2026-09-12T17:35:00.000Z",
        arrivalAt: "2026-09-12T18:00:00.000Z",
        airlineName: "Aegean Atlas",
        airlineCode: "AG",
        flightNumber: "AG91",
      },
    ],
    indicativePrice: { amount: 260, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bkk-lca-0912",
  },
  {
    id: "mock-bkk-lca-0914",
    provider: "mock",
    origin: "BKK",
    destination: "LCA",
    departureAt: "2026-09-14T07:00:00.000Z",
    arrivalAt: "2026-09-14T16:30:00.000Z",
    durationMinutes: 570,
    stops: 0,
    segments: [
      {
        origin: "BKK",
        destination: "LCA",
        departureAt: "2026-09-14T07:00:00.000Z",
        arrivalAt: "2026-09-14T16:30:00.000Z",
        airlineName: "Mediterranean Connect",
        airlineCode: "MC",
        flightNumber: "MC412",
      },
    ],
    indicativePrice: { amount: 300, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bkk-lca-0914",
  },
  {
    id: "mock-bkk-lca-0914-late",
    provider: "mock",
    origin: "BKK",
    destination: "LCA",
    departureAt: "2026-09-14T10:00:00.000Z",
    arrivalAt: "2026-09-21T12:00:00.000Z",
    durationMinutes: 630,
    stops: 1,
    segments: [
      {
        origin: "BKK",
        destination: "DXB",
        departureAt: "2026-09-14T10:00:00.000Z",
        arrivalAt: "2026-09-14T16:00:00.000Z",
        airlineName: "Andaman Air",
        airlineCode: "AA",
        flightNumber: "AA504",
      },
      {
        origin: "DXB",
        destination: "LCA",
        departureAt: "2026-09-21T07:00:00.000Z",
        arrivalAt: "2026-09-21T12:00:00.000Z",
        airlineName: "Mediterranean Connect",
        airlineCode: "MC",
        flightNumber: "MC990",
      },
    ],
    indicativePrice: { amount: 280, currency: "AUD" },
    bookingUrl: "https://example.com/mock/mock-bkk-lca-0914-late",
  },
];

function isValidDepartureDate(dateTime: string, window: DateWindow): boolean {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const departureDate = parsed.toISOString().slice(0, 10);
  return departureDate >= window.start && departureDate <= window.end;
}

function cloneOffer(offer: FlightOffer): FlightOffer {
  return {
    ...offer,
    indicativePrice: { ...offer.indicativePrice },
    segments: offer.segments.map((segment) => ({ ...segment })),
  };
}

async function searchOneWay(input: FlightSearchInput): Promise<FlightOffer[]> {
  // Return copies so callers cannot mutate the shared fixture set.
  return MOCK_OFFERS.filter((offer) => {
    return (
      offer.origin === input.origin &&
      offer.destination === input.destination &&
      isValidDepartureDate(offer.departureAt, input.departureWindow)
    );
  }).map(cloneOffer);
}

export const mockFlightProvider: FlightProvider = {
  name: "mock",
  searchOneWay,
};
