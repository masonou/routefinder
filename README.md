# Slow Layover

Slow Layover finds one-way journeys with intentional 2–6 night stopovers.

```text
Homepage → POST /api/search → Redis cache → dynamic route discovery → SearchAPI.io
```

Dynamic discovery finds direct destinations for the selected departure date, ranks sensible stopover candidates, validates onward dates, verifies flight offers, and compares a direct baseline. The planner and domain types are provider-neutral.

## Development

```bash
npm run dev
npm test
npm run lint
```

Open [http://localhost:3000](http://localhost:3000).

Required environment variable:

```env
SEARCHAPI_API_KEY=
```

Redis caching is optional locally:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Airport metadata

Autocomplete, public airport validation, display names, and route geography use a generated global passenger-airport catalogue from [OurAirports](https://ourairports.com/data/). Regenerate it with `npm run airports:generate`; airport metadata is never downloaded at runtime.

## Debugging dynamic hub discovery

```bash
npm run hubs:debug -- LCA DPS 2026-09-01
```

The script loads `SEARCHAPI_API_KEY` from `.env.local` when available and prints normalized candidate and Calendar-validation fields only.

## Caching and analytics

Search results are cached in Redis for five minutes; empty results use a one-minute TTL. Cache failures fall back to a live provider request. PostHog records `search_submitted`, `results_found`, `no_results`, `search_failed`, and `affiliate_click` without sending departure dates.
