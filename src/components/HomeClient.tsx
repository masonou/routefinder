"use client";

import { useState } from "react";

import type { SearchFormValues } from "@/lib/utils/searchValidation";
import { SearchForm } from "./SearchForm";

interface JourneyExample {
  origin: string;
  destination: string;
  stops: Array<{ city: string; nights: number }>;
  detail: string;
  originCode: string;
  destinationCode: string;
}

const JOURNEY_EXAMPLES: JourneyExample[] = [
  {
    origin: "Brisbane",
    destination: "Milan",
    stops: [
      { city: "Bangkok", nights: 3 },
      { city: "Istanbul", nights: 2 },
    ],
    detail: "Street food, temple mornings, and a Bosphorus sunset before northern Italy.",
    originCode: "BNE",
    destinationCode: "MXP",
  },
  {
    origin: "Larnaca",
    destination: "London",
    stops: [{ city: "Rome", nights: 3 }],
    detail: "Trade a quick connection for three unhurried days of trattorias and piazzas.",
    originCode: "LCA",
    destinationCode: "LHR",
  },
  {
    origin: "Madrid",
    destination: "Santiago",
    stops: [{ city: "Buenos Aires", nights: 4 }],
    detail: "Break up the crossing with late dinners, bookshops, and a few extra tango nights.",
    originCode: "MAD",
    destinationCode: "SCL",
  },
];

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Tell us where you’re going",
    detail: "Start with the cities you want to travel between and when you’d like to leave.",
  },
  {
    number: "02",
    title: "We find interesting stopovers",
    detail: "We look for real flight combinations that leave room to actually explore.",
  },
  {
    number: "03",
    title: "Make the journey part of the trip",
    detail: "Compare routes, then book the flights that fit your plans through a travel provider.",
  },
];

const FAQS = [
  {
    question: "Are these real flights?",
    answer: "Yes. Slow Layover searches real flight options and presents routes that include intentional multi-day stops.",
  },
  {
    question: "Is Slow Layover a booking site?",
    answer: "No. When you find a route you like, you book it through an external travel site or airline.",
  },
  {
    question: "What counts as a stopover?",
    answer: "A stopover is a planned stay of a few days in another city — not an airport layover between flights.",
  },
  {
    question: "Why can flight prices change?",
    answer: "Fares are indicative snapshots. Airlines and travel sites can update availability and prices at any time.",
  },
  {
    question: "Does this only work for long-haul flights?",
    answer: "No. If there’s an interesting city between A and B, Slow Layover can be useful on shorter routes too.",
  },
];

function exampleDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 45);
  return date.toISOString().slice(0, 10);
}

export function HomeClient() {
  const [formValues, setFormValues] = useState<SearchFormValues | null>(null);

  function tryRoute(example: JourneyExample) {
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
    <main className="min-h-svh overflow-hidden bg-[#f7f8fa] text-slate-950">
      <div className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/80 via-[#f7f8fa] to-[#f7f8fa]"
        />
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="flex h-20 items-center justify-between" aria-label="Slow Layover">
            <p className="text-lg font-bold tracking-tight text-slate-950">
              Slow Layover <span className="font-medium text-slate-500">Beta</span>
            </p>
            <a
              href="#how-it-works"
              className="hidden text-sm font-semibold text-slate-600 transition hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:block"
            >
              How it works
            </a>
          </header>

          <section className="pb-16 pt-12 sm:pb-24 sm:pt-18 lg:pb-28 lg:pt-24">
            <div className="mx-auto max-w-5xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-sm font-semibold text-blue-900 shadow-sm shadow-blue-950/5">
                <span className="size-1.5 rounded-full bg-blue-600" aria-hidden="true" />
                A better way to break up a journey
              </p>
              <h1 className="mx-auto mt-5 max-w-4xl text-balance text-4xl font-bold tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.06]">
                Going from A to B? See what’s worth stopping for in between.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-600 sm:text-lg">
                Slow Layover finds real flight combinations with multi-day stops, so you can explore another city on the way to your destination.
              </p>
            </div>

            <div id="trip-search" className="mx-auto mt-9 max-w-5xl scroll-mt-6 sm:mt-10">
              <SearchForm
                key={formValues ? `${formValues.origin}-${formValues.destination}-${formValues.earliestDeparture}` : "empty"}
                initialValues={formValues ?? undefined}
              />
              <p className="mt-3 text-center text-sm text-slate-500">
                Search routes with room to stay, wander, and continue on.
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="journey-examples-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">Real trip ideas</p>
            <h2 id="journey-examples-heading" className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              A connection can become a city break.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-600 sm:text-right">
            These are example journeys to show what a Slow Layover route can look like — not live prices or guaranteed availability.
          </p>
        </div>

        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {JOURNEY_EXAMPLES.map((example) => (
            <article key={`${example.origin}-${example.destination}`} className="flex min-h-82 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/8 sm:p-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <span>Example route</span>
                <span aria-hidden="true" className="text-blue-700">✦</span>
              </div>
              <div className="mt-7 flex items-start gap-3">
                <div className="min-w-0 flex-1 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">From</span>
                  <span className="mt-1 block text-base font-bold text-slate-950">{example.origin}</span>
                </div>
                <div className="mt-6 flex shrink-0 items-center gap-1.5 text-blue-600" aria-hidden="true">
                  <span className="h-px w-3 bg-blue-300" />
                  <span>→</span>
                  <span className="h-px w-3 bg-blue-300" />
                </div>
                <div className="min-w-0 flex-1 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">To</span>
                  <span className="mt-1 block text-base font-bold text-slate-950">{example.destination}</span>
                </div>
              </div>
              <div className="relative my-6 border-l border-dashed border-blue-300 pl-5">
                {example.stops.map((stop, index) => (
                  <div key={stop.city} className={index > 0 ? "mt-3" : ""}>
                    <span className="absolute -left-1.25 mt-2 size-2.5 rounded-full border-2 border-white bg-blue-600" aria-hidden="true" />
                    <p className="font-bold text-slate-900">{stop.city}</p>
                    <p className="text-sm text-blue-800">Stay {stop.nights} nights</p>
                  </div>
                ))}
              </div>
              <p className="text-sm leading-6 text-slate-600">{example.detail}</p>
              <button
                type="button"
                onClick={() => tryRoute(example)}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-blue-50 px-4 text-sm font-bold text-blue-800 outline-none transition hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              >
                Try this route <span aria-hidden="true">→</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-6 bg-slate-950 py-16 text-white sm:py-20" aria-labelledby="how-it-works-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-300">How it works</p>
          <div className="mt-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <h2 id="how-it-works-heading" className="max-w-xl text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
              More time in the places between here and there.
            </h2>
            <p className="max-w-md text-sm leading-6 text-slate-300">
              One search, designed for travellers who would rather have a few days somewhere new than a rushed connection.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <li key={step.number} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <span className="text-sm font-bold text-blue-300">{step.number}</span>
                <h3 className="mt-8 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:px-8" aria-labelledby="why-heading">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">Why Slow Layover?</p>
          <h2 id="why-heading" className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Born from too many tabs and too little time.
          </h2>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6 sm:p-8">
          <p className="text-lg leading-8 text-slate-800 sm:text-xl">
            Slow Layover came from spending too much time manually figuring out which cities made sense to stop in for a few days while travelling between countries. It should be easier to make the in-between part of a trip worth looking forward to.
          </p>
          <p className="mt-5 text-sm font-bold text-blue-800">— The Slow Layover team</p>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-16 sm:py-20" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">Good to know</p>
          <h2 id="faq-heading" className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group py-1">
                <summary className="flex min-h-15 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-base font-bold text-slate-900 outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-blue-700">
                  {faq.question}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-normal text-slate-600 transition group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="max-w-2xl pb-5 pr-10 text-sm leading-6 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8" aria-labelledby="final-cta-heading">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800 px-6 py-12 text-center text-white shadow-xl shadow-blue-950/15 sm:px-12 sm:py-16">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-200">Plan the scenic route</p>
          <h2 id="final-cta-heading" className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            Where could you stop on your next trip?
          </h2>
          <a
            href="#trip-search"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-blue-800 shadow-lg shadow-blue-950/15 outline-none transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
          >
            Find your route
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        Built for the journey.
      </footer>
    </main>
  );
}
