"use client";

import { useState } from "react";

import type { SearchFormValues } from "@/lib/utils/searchValidation";
import { SearchForm } from "./SearchForm";

interface JourneyExample {
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  stopovers: Array<{ city: string; nights: number }>;
}

const JOURNEY_EXAMPLES: JourneyExample[] = [
  {
    origin: "Sydney",
    originCode: "SYD",
    destination: "Paris",
    destinationCode: "CDG",
    stopovers: [{ city: "Bangkok", nights: 4 }],
  },
  {
    origin: "San Francisco",
    originCode: "SFO",
    destination: "Rome",
    destinationCode: "FCO",
    stopovers: [
      { city: "Paris", nights: 2 },
      { city: "Prague", nights: 2 },
    ],
  },
  {
    origin: "London",
    originCode: "LHR",
    destination: "Tokyo",
    destinationCode: "NRT",
    stopovers: [{ city: "Istanbul", nights: 3 }],
  },
];

function exampleDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 45);
  return date.toISOString().slice(0, 10);
}

export function HomeClient() {
  const [formValues, setFormValues] = useState<SearchFormValues | null>(null);

  function prefillSearch(example: JourneyExample) {
    setFormValues({
      origin: example.originCode,
      destination: example.destinationCode,
      earliestDeparture: exampleDepartureDate(),
    });

    window.requestAnimationFrame(() => {
      document.getElementById("trip-search")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  return (
    <main className="min-h-svh bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="flex h-18 items-center" aria-label="Slow Layover">
          <p className="text-lg font-semibold tracking-tight text-slate-950">
            Slow Layover <span className="font-normal text-slate-500">Beta</span>
          </p>
        </header>

        <section className="pb-20 pt-12 sm:pb-28 sm:pt-18 lg:pb-32 lg:pt-24">
          <div className="mx-auto max-w-5xl">
            <h1 className="mx-auto max-w-4xl text-center text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.04]">
              Find somewhere worth stopping along the way
            </h1>
            <div id="trip-search" className="mt-10 scroll-mt-6 sm:mt-12">
              <SearchForm
                key={
                  formValues
                    ? `${formValues.origin}-${formValues.destination}-${formValues.earliestDeparture}`
                    : "empty"
                }
                initialValues={formValues ?? undefined}
              />
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 py-16 sm:py-20" aria-labelledby="examples-heading">
          <div className="max-w-4xl">
            <h2 id="examples-heading" className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">
              A few ways to make the journey longer
            </h2>
            <div className="mt-7 divide-y divide-slate-200 border-y border-slate-200">
              {JOURNEY_EXAMPLES.map((example) => (
                <button
                  key={`${example.originCode}-${example.destinationCode}`}
                  type="button"
                  onClick={() => prefillSearch(example)}
                  className="group block w-full py-5 text-left outline-none transition first:pt-5 last:pb-5 hover:bg-white focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-inset sm:px-3"
                  aria-label={`Search from ${example.origin} to ${example.destination}`}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg leading-8 text-slate-700 sm:text-xl">
                    <span className="font-medium text-slate-950">{example.origin}</span>
                    <span aria-hidden="true" className="text-slate-400">→</span>
                    {example.stopovers.map((stopover) => (
                      <span key={stopover.city} className="contents">
                        <strong className="font-semibold text-blue-800 underline decoration-blue-200 underline-offset-4 transition group-hover:decoration-blue-500">
                          {stopover.nights} nights {stopover.city}
                        </strong>
                        <span aria-hidden="true" className="text-slate-400">→</span>
                      </span>
                    ))}
                    <span className="font-medium text-slate-950">{example.destination}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-500">
                    Example journey — click to try this route
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 py-16 sm:py-20" aria-labelledby="feedback-heading">
          <div className="grid max-w-4xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 id="feedback-heading" className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">
                Got feedback?
              </h2>
              <p className="mt-3 max-w-md leading-7 text-slate-600">
                Slow Layover is still in beta. If something feels confusing, broken, or genuinely useful, I’d love to hear it.
              </p>
            </div>
            <form action="https://formspree.io/f/mqpanjgb" method="POST" className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800">
                  Name <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Email <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-800">
                Message
                <textarea
                  name="message"
                  required
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                />
              </label>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white outline-none transition hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              >
                Send feedback
              </button>
            </form>
          </div>
        </section>

        <footer className="border-t border-slate-200 py-7 text-sm text-slate-500">
          Slow Layover
        </footer>
      </div>
    </main>
  );
}
