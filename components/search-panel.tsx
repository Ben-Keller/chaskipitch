"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CountryContent, ThemeContent } from "@/lib/types";

interface SearchPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  countries: CountryContent[];
  themes: ThemeContent[];
}

export function SearchPanel({ query, onQueryChange, countries, themes }: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalized = query.trim().toLowerCase();

  const countryMatches = normalized
    ? countries.filter((country) => country.name.toLowerCase().includes(normalized)).slice(0, 5)
    : [];

  const themeMatches = normalized
    ? themes.filter((theme) => theme.name.toLowerCase().includes(normalized)).slice(0, 4)
    : [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const targetIsEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (event.key === "/" && !targetIsEditable) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && target === inputRef.current) {
        onQueryChange("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onQueryChange]);

  function renderHighlighted(value: string) {
    if (!normalized) {
      return value;
    }

    const lower = value.toLowerCase();
    const index = lower.indexOf(normalized);
    if (index < 0) {
      return value;
    }

    const start = value.slice(0, index);
    const match = value.slice(index, index + normalized.length);
    const end = value.slice(index + normalized.length);

    return (
      <>
        {start}
        <mark>{match}</mark>
        {end}
      </>
    );
  }

  return (
    <section className="panel" aria-labelledby="search-heading">
      <p className="section-kicker">Search</p>
      <h2 id="search-heading">Find countries and themes</h2>
      <div className="controls-row">
        <label htmlFor="search-input" className="note">
          Search
        </label>
        <input
          id="search-input"
          type="search"
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Try: Brazil, women, finance"
          aria-describedby="search-help"
        />
      </div>
      <p id="search-help" className="note">
        Search results include country pages and thematic explorations. Press <kbd>/</kbd> to focus search.
      </p>
      {normalized ? (
        <ul className="search-results" aria-label="Search results">
          {countryMatches.map((country) => (
            <li key={country.iso3}>
              <Link href={`/countries/${country.iso3}`}>
                <span>{renderHighlighted(country.name)}</span>
                <span className="note">Country</span>
              </Link>
            </li>
          ))}
          {themeMatches.map((theme) => (
            <li key={theme.slug}>
              <Link href={`/thematics/${theme.slug}`}>
                <span>{renderHighlighted(theme.name)}</span>
                <span className="note">Theme</span>
              </Link>
            </li>
          ))}
          {countryMatches.length === 0 && themeMatches.length === 0 ? <li className="note">No matches yet.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
