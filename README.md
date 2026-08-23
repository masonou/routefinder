## Slow Layover

Slow Layover finds one-way itineraries with a 2–6 night stopover in Bangkok. Its request flow is:

```text
frontend → POST /api/search → Redis cache → planner → FlightProvider → SearchAPI.io Google Flights
```

The planner and domain types remain provider-neutral. Bangkok (`BKK`) is the current hub, the target stay is four nights, and the selected earliest departure is searched across that date plus three calendar days.

## Dynamic Hub Discovery V2

The development-only discovery pipeline:

1. finds nonstop destinations with Travel Explore;
2. ranks geographically sensible hub candidates;
3. validates onward flights in the 2–6 night Calendar window; and
4. returns the top validated hubs.

Detailed itinerary-search integration is not enabled yet.

```bash
npm run hubs:debug -- LCA DPS 2026-09-01
```

The script loads `SEARCHAPI_API_KEY` from `.env.local` when present and prints
only normalized candidate and Calendar-validation fields.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Required environment variable:

```env
SEARCHAPI_API_KEY=
```

Redis caching is optional locally and uses:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Search caching

Public searches are cached in Redis for five minutes; empty results use a one-minute TTL. Booking-option lookups are cached for five minutes using a hash of the provider booking reference. Cache failures fall back to a live provider request. Configure production rate limiting for both `/api/search` and `/api/booking-options` at the Vercel WAF level; each booking-options cache miss creates a SearchAPI request.

## Product analytics

PostHog tracks the core funnel with five custom events: `search_submitted` for valid route searches, `results_found` and `no_results` for successful search outcomes, `search_failed` for technical failures, and `affiliate_click` for Kiwi outbound clicks. Search events include only airport codes (never the departure date); affiliate clicks include the displayed itinerary rank and fare context.

## Deployment

Deploy as a standard Next.js application on Vercel and configure the environment variables above.
