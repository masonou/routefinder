"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { findAirportByCode, type Airport } from "@/data/airports";
import {
  buildResultsUrl,
  type SearchFormErrors,
  type SearchFormValues,
  validateSearchFormValues,
} from "@/lib/utils/searchValidation";
import { trackSearchSubmitted } from "@/lib/analytics/events";
import { AirportAutocomplete } from "./AirportAutocomplete";
import { FlexibleDatePicker } from "./FlexibleDatePicker";

const INITIAL_VALUES: SearchFormValues = {
  origin: "",
  destination: "",
  earliestDeparture: "",
  arriveBy: "",
};

function hasErrors(errors: SearchFormErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string");
}

interface SearchFormProps {
  initialValues?: SearchFormValues;
}

export function SearchForm({ initialValues = INITIAL_VALUES }: SearchFormProps) {
  const router = useRouter();
  const [originAirport, setOriginAirport] = useState<Airport | null>(() =>
    findAirportByCode(initialValues.origin) ?? null,
  );
  const [destinationAirport, setDestinationAirport] = useState<Airport | null>(
    () => findAirportByCode(initialValues.destination) ?? null,
  );
  const [values, setValues] = useState<SearchFormValues>(initialValues);
  const [errors, setErrors] = useState<SearchFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateAirport(
    field: "origin" | "destination",
    airport: Airport | null,
  ) {
    setValues((current) => ({ ...current, [field]: airport?.iataCode ?? "" }));
  }

  function updateDate(value: string) {
    setValues((current) => ({ ...current, earliestDeparture: value }));
  }
  function updateArriveBy(value: string) {
    setValues((current) => ({ ...current, arriveBy: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSearchFormValues(values);
    setErrors(nextErrors);
    if (!hasErrors(nextErrors)) {
      setIsSubmitting(true);
      trackSearchSubmitted({
        origin: values.origin,
        destination: values.destination,
        departureDate: values.earliestDeparture,
        arriveByDate: values.arriveBy,
      });
      router.push(buildResultsUrl(values));
    }
  }

  return (
    <form
      className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 sm:p-6"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span
          className="inline-block size-2 rounded-full bg-blue-700"
          aria-hidden="true"
        />
        One-way journey
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(10rem,auto)] lg:gap-5">
        <AirportAutocomplete
          id="origin"
          label="From"
          value={originAirport}
          onChange={(airport) => {
            setOriginAirport(airport);
            updateAirport("origin", airport);
          }}
          error={errors.origin}
          placeholder="City or airport"
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
          placeholder="City or airport"
        />
        <FlexibleDatePicker
          value={values.earliestDeparture}
          onChange={updateDate}
          error={errors.dates}
          label="Depart"
        />
        <FlexibleDatePicker
          value={values.arriveBy ?? ""}
          onChange={updateArriveBy}
          error={errors.dates}
          label="Arrive by"
          minDate={values.earliestDeparture || undefined}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-14 w-full items-center justify-center self-start rounded-lg bg-blue-700 px-5 text-base font-semibold text-white outline-none transition hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-blue-600 md:mt-8"
        >
          {isSubmitting ? "Searching…" : "Find routes"}
        </button>
      </div>
    </form>
  );
}
