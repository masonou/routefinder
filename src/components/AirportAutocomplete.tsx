"use client";

import { useId, useState, type KeyboardEvent } from "react";

import type { Airport } from "@/data/airports";
import { searchAirports } from "@/lib/utils/airportSearch";

export interface AirportAutocompleteProps {
  id: string;
  label: string;
  value: Airport | null;
  onChange: (airport: Airport | null) => void;
  error?: string;
  placeholder?: string;
}

function selectedLabel(airport: Airport | null): string {
  return airport ? `${airport.city} (${airport.iataCode})` : "";
}

export function AirportAutocomplete({
  id,
  label,
  value,
  onChange,
  error,
  placeholder = "Search airports",
}: AirportAutocompleteProps) {
  const listboxId = useId();
  const [inputValue, setInputValue] = useState(selectedLabel(value));
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = isOpen && inputValue.trim().length > 0 ? searchAirports(inputValue) : [];

  function chooseAirport(airport: Airport) {
    onChange(airport);
    setInputValue(selectedLabel(airport));
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue);
    if (value) onChange(null);
    setIsOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && isOpen && suggestions.length > 0) {
      event.preventDefault();
      chooseAirport(suggestions[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-semibold text-slate-900" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          placeholder={placeholder}
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? "true" : "false"}
          className={`min-h-14 w-full rounded-lg border bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200 ${error ? "border-red-600" : "border-slate-300 hover:border-slate-400"}`}
        />
        {isOpen && suggestions.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-40 mt-2 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
          >
            {suggestions.map((airport, index) => (
              <li
                key={airport.iataCode}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseAirport(airport);
                }}
                className={`cursor-pointer px-4 py-3 text-sm ${
                  index === activeIndex ? "bg-blue-50 text-blue-950" : "text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium">
                  {airport.city} — {airport.name} ({airport.iataCode})
                </span>
                <span className="block text-slate-600">{airport.country}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
