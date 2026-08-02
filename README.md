This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Flight planner architecture

The `planner` modules contain the product logic for building and ranking one-way hub itineraries. The `providers` layer is responsible for talking to external flight-data sources, while the application types stay provider-neutral so the rest of the app does not depend on Duffel-specific shapes.

V1 currently considers only Bangkok Suvarnabhumi (`BKK`) as a candidate hub. The mock provider is ready for local development and testing, while the Duffel provider is intentionally left unimplemented until the current API contract is verified.

```ts
import { planTrip } from "@/lib/planner/planTrip";
import { mockFlightProvider } from "@/lib/providers/mockFlightProvider";

const request = {
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
};

const itineraries = await planTrip(request, mockFlightProvider);
```

## Manual verification

1. Select Brisbane and Larnaca from the airport suggestions.
2. Choose an earliest departure of `2026-08-10` and latest arrival of `2026-08-18`.
3. Submit the form and confirm the URL contains only `origin`, `destination`, `earliestDeparture`, and `latestArrival`.
4. Confirm every displayed itinerary departs on or after 10 August, arrives in Larnaca by 18 August, and includes a 2–6 night Bangkok stay.
