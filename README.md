## Slow Layover

Slow Layover finds one-way itineraries with a 2–6 night stopover. Its request flow is:

```text
frontend → POST /api/search → Redis cache → dynamic planner → SearchAPI.io Google Flights
```

The planner and domain types remain provider-neutral. Dynamic discovery uses Travel Explore for the selected earliest departure date, validates a 2–6 night Calendar window, then verifies detailed flight offers. It intentionally does not run Explore across the full D through D+3 window yet, keeping the cold-search request budget bounded. The old Bangkok (`BKK`) planner remains available only as a temporary server-side rollback mode.

## Dynamic Hub Discovery V2

The dynamic discovery pipeline:

1. finds nonstop destinations with Travel Explore;
2. ranks geographically sensible hub candidates;
3. validates onward flights in the 2–6 night Calendar window; and
4. verifies the top three hubs using detailed Google Flights offers.

Set `DYNAMIC_HUB_DISCOVERY_ENABLED=true` to enable it in production search. With the flag set to `false` (the default), the legacy BKK planner retains its existing D through D+3 first-leg window.

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
