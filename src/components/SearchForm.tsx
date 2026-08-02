"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { Airport } from "@/data/airports";
import {
  buildResultsUrl,
  type SearchFormErrors,
  type SearchFormValues,
  validateSearchFormValues,
} from "@/lib/utils/searchValidation";
import { AirportAutocomplete } from "./AirportAutocomplete";

const INITIAL_VALUES: SearchFormValues = {
  origin: "",
  destination: "",
  earliestDeparture: "",
  latestArrival: "",
};

function hasErrors(errors: SearchFormErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string");
}

export function SearchForm() {
  const router = useRouter();
  const [originAirport, setOriginAirport] = useState<Airport | null>(null);
  const [destinationAirport, setDestinationAirport] = useState<Airport | null>(null);
  const [values, setValues] = useState<SearchFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<SearchFormErrors>({});

  function updateAirport(field: "origin" | "destination", airport: Airport | null) {
    setValues((current) => ({ ...current, [field]: airport?.iataCode ?? "" }));
  }

  function updateDate(field: "earliestDeparture" | "latestArrival", value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSearchFormValues(values);
    setErrors(nextErrors);
    if (!hasErrors(nextErrors)) router.push(buildResultsUrl(values));
  }

  return (
    <form className="w-full space-y-6 rounded-xl border border-stone-200 bg-white p-6" onSubmit={handleSubmit} noValidate>
      <AirportAutocomplete
        id="origin"
        label="From"
        value={originAirport}
        onChange={(airport) => {
          setOriginAirport(airport);
          updateAirport("origin", airport);
        }}
        error={errors.origin}
        placeholder="Brisbane or BNE"
      />
      <AirportAutocomplete
        id="destination"
        label="To"
        value={destinationAirport}
        onChange={(airport) => {
          setDestinationAirport(airport);
          updateAirport("destination", airport);
        }}
        error={errors.destination}
        placeholder="Larnaca or LCA"
      />
      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-900" htmlFor="earliest-departure">
          Earliest departure
        </label>
        <input
          id="earliest-departure"
          type="date"
          value={values.earliestDeparture}
          onChange={(event) => updateDate("earliestDeparture", event.target.value)}
          aria-describedby={errors.dates ? "dates-error" : undefined}
          aria-invalid={errors.dates ? "true" : "false"}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-950 outline-none focus:border-blue-600"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-900" htmlFor="latest-arrival">
          Latest arrival
        </label>
        <input
          id="latest-arrival"
          type="date"
          value={values.latestArrival}
          onChange={(event) => updateDate("latestArrival", event.target.value)}
          aria-describedby={errors.dates ? "dates-error" : undefined}
          aria-invalid={errors.dates ? "true" : "false"}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-950 outline-none focus:border-blue-600"
        />
        {errors.dates ? <p id="dates-error" className="text-sm text-red-700">{errors.dates}</p> : null}
      </div>
      <button type="submit" className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Find routes
      </button>
    </form>
  );
}
