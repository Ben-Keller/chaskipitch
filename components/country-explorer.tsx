"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CountryContent } from "@/lib/types";
import { SourcePill } from "@/components/source-pill";

interface CountryExplorerProps {
  countries: CountryContent[];
}

const regionOptions = ["all", "africa", "asia", "latin_america"] as const;

type RegionFilter = (typeof regionOptions)[number];

export function CountryExplorer({ countries }: CountryExplorerProps) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<RegionFilter>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return countries.filter((country) => {
      if (region !== "all" && country.region !== region) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        country.name.toLowerCase().includes(normalized) ||
        country.thematics.some((theme) => theme.toLowerCase().includes(normalized))
      );
    });
  }, [countries, query, region]);

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          Country Explorer
        </p>
        <h1>Country drill-down atlas</h1>
        <p>
          Browse implementation countries, preparation countries, and assessment geographies. Each country page includes
          story panels, metrics, partners, and project geography overlays.
        </p>
      </section>

      <section className="panel">
        <div className="controls-row">
          <label htmlFor="country-search" className="note">
            Search countries
          </label>
          <input
            id="country-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by country or theme"
          />
        </div>
        <div className="controls-row" style={{ marginTop: "0.6rem" }}>
          {regionOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={region === option}
              onClick={() => setRegion(option)}
            >
              {option === "all" ? "All regions" : option.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </section>

      <section className="grid-3" aria-label="Country cards">
        {filtered.map((country) => (
          <article className="panel" key={country.iso3}>
            <p className="section-kicker">{country.region.replaceAll("_", " ")}</p>
            <h2>{country.name}</h2>
            <p>{country.summary}</p>
            <p className="note">
              Status: {country.status.replaceAll("_", " ")} | Projects: {country.project_count}
            </p>
            <p className="note">Status tags: {country.status_tags.join(", ")}</p>
            <div className="tag-row" style={{ marginBottom: "0.5rem" }}>
              {country.thematics.slice(0, 3).map((theme) => (
                <span className="tag" key={theme} style={{ color: "#133b35", borderColor: "rgba(20,59,53,0.3)" }}>
                  {theme}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Link href={`/countries/${country.iso3}`}>
                <strong>Open country story</strong>
              </Link>
              <SourcePill page={Array.isArray(country.metrics.source_page) ? country.metrics.source_page[0] : (country.metrics.source_page as number)} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
