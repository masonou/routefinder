"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  buildResultsUrl,
  normalizeAirportCodeInput,
  type SearchFormErrors,
  type SearchFormValues,
  validateSearchFormValues,
} from "../lib/utils/searchValidation.ts";

const INITIAL_VALUES: SearchFormValues = {
  origin: "",
  destination: "",
  departureStart: "",
  departureEnd: "",
  arrivalStart: "",
  arrivalEnd: "",
};

function hasErrors(errors: SearchFormErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string");
}

export function SearchForm() {
  const router = useRouter();
  const [values, setValues] = useState<SearchFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<SearchFormErrors>({});
  const isMissingRequiredField = Object.values(values).some((value) => value === "");

  function updateAirportField(field: "origin" | "destination", value: string) {
    setValues((current) => ({
      ...current,
      [field]: normalizeAirportCodeInput(value),
    }));
  }

  function updateDateField(
    field:
      | "departureStart"
      | "departureEnd"
      | "arrivalStart"
      | "arrivalEnd",
    value: string
  ) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateSearchFormValues(values);
    setErrors(nextErrors);

    if (hasErrors(nextErrors)) {
      return;
    }

    router.push(buildResultsUrl(values));
  }

  return (
    <form
      className="w-full space-y-6 rounded-xl border border-stone-200 bg-white p-6"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-900" htmlFor="origin">
          From
        </label>
        <input
          id="origin"
          name="origin"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          maxLength={3}
          placeholder="BNE"
          value={values.origin}
          onChange={(event) => updateAirportField("origin", event.target.value)}
          aria-describedby={errors.origin ? "origin-error" : undefined}
          aria-invalid={errors.origin ? "true" : "false"}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-base uppercase text-stone-950 outline-none ring-0 placeholder:text-stone-400 focus:border-blue-600"
        />
        {errors.origin ? (
          <p id="origin-error" className="text-sm text-red-700">
            {errors.origin}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-stone-900"
          htmlFor="destination"
        >
          To
        </label>
        <input
          id="destination"
          name="destination"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          maxLength={3}
          placeholder="LCA"
          value={values.destination}
          onChange={(event) => updateAirportField("destination", event.target.value)}
          aria-describedby={errors.destination ? "destination-error" : undefined}
          aria-invalid={errors.destination ? "true" : "false"}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-base uppercase text-stone-950 outline-none ring-0 placeholder:text-stone-400 focus:border-blue-600"
        />
        {errors.destination ? (
          <p id="destination-error" className="text-sm text-red-700">
            {errors.destination}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-900">Leave between</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-stone-700" htmlFor="departure-start">
              Earliest departure
            </label>
            <input
              id="departure-start"
              name="departure-start"
              type="date"
              value={values.departureStart}
              onChange={(event) => updateDateField("departureStart", event.target.value)}
              aria-describedby={errors.departure ? "departure-error" : undefined}
              aria-invalid={errors.departure ? "true" : "false"}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-950 outline-none focus:border-blue-600"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-stone-700" htmlFor="departure-end">
              Latest departure
            </label>
            <input
              id="departure-end"
              name="departure-end"
              type="date"
              value={values.departureEnd}
              onChange={(event) => updateDateField("departureEnd", event.target.value)}
              aria-describedby={errors.departure ? "departure-error" : undefined}
              aria-invalid={errors.departure ? "true" : "false"}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-950 outline-none focus:border-blue-600"
            />
          </div>
        </div>
        {errors.departure ? (
          <p id="departure-error" className="text-sm text-red-700">
            {errors.departure}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-900">Arrive between</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-stone-700" htmlFor="arrival-start">
              Earliest arrival
            </label>
            <input
              id="arrival-start"
              name="arrival-start"
              type="date"
              value={values.arrivalStart}
              onChange={(event) => updateDateField("arrivalStart", event.target.value)}
              aria-describedby={errors.arrival ? "arrival-error" : undefined}
              aria-invalid={errors.arrival ? "true" : "false"}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-950 outline-none focus:border-blue-600"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-stone-700" htmlFor="arrival-end">
              Latest arrival
            </label>
            <input
              id="arrival-end"
              name="arrival-end"
              type="date"
              value={values.arrivalEnd}
              onChange={(event) => updateDateField("arrivalEnd", event.target.value)}
              aria-describedby={errors.arrival ? "arrival-error" : undefined}
              aria-invalid={errors.arrival ? "true" : "false"}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-base text-stone-950 outline-none focus:border-blue-600"
            />
          </div>
        </div>
        {errors.arrival ? (
          <p id="arrival-error" className="text-sm text-red-700">
            {errors.arrival}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isMissingRequiredField}
        className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-stone-300"
      >
        Find routes
      </button>
    </form>
  );
}
