## Slow Layover

Slow Layover finds one-way itineraries with a 2–6 night stopover in Bangkok. Its request flow is:

```text
frontend → POST /api/search → Redis cache → planner → FlightProvider → SearchAPI.io Google Flights
```

The planner and domain types remain provider-neutral. Bangkok (`BKK`) is the current hub, the target stay is four nights, and the selected earliest departure is searched across that date plus three calendar days.

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

Public searches are cached in Redis for five minutes; empty results use a one-minute TTL. Cache failures fall back to a live planner search. Configure production rate limiting for `/api/search` at the Vercel WAF level.

## Deployment

Deploy as a standard Next.js application on Vercel and configure the environment variables above.
