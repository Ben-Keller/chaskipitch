"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ThemeContent } from "@/lib/types";
import { SourcePill } from "@/components/source-pill";

interface ThematicsBrowserProps {
  themes: ThemeContent[];
}

export function ThematicsBrowser({ themes }: ThematicsBrowserProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return themes;
    }

    return themes.filter(
      (theme) =>
        theme.name.toLowerCase().includes(normalized) ||
        theme.description.toLowerCase().includes(normalized) ||
        theme.related_stories.some((story) => story.toLowerCase().includes(normalized))
    );
  }, [themes, query]);

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          Thematics
        </p>
        <h1>Browse across report themes</h1>
        <p>
          Themes combine KPIs, countries, stories, and charts from across the annual report, allowing the narrative to
          be read through topic-based lenses rather than geography alone.
        </p>
      </section>

      <section className="panel">
        <div className="controls-row">
          <label htmlFor="theme-search" className="note">
            Search themes
          </label>
          <input
            id="theme-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by theme or story"
          />
        </div>
      </section>

      <section className="grid-2" aria-label="Theme cards">
        {filtered.map((theme) => (
          <article className="panel" key={theme.slug}>
            <p className="section-kicker">Theme</p>
            <h2>{theme.name}</h2>
            <p>{theme.description}</p>
            <p className="note">Related countries: {theme.related_countries.length}</p>
            <p className="note">Charts: {theme.related_charts.length}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              <Link href={`/thematics/${theme.slug}`}>
                <strong>Open thematic view</strong>
              </Link>
              <SourcePill page={theme.source_pages[0]} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
