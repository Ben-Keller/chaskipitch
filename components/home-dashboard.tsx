"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CountryContent, GeoFeatureCollection, GlobalContent, QuoteItem, ThemeContent } from "@/lib/types";
import { KpiStrip } from "@/components/kpi-strip";
import { TimelineStrip } from "@/components/timeline-strip";
import { SearchPanel } from "@/components/search-panel";
import { SourcePill } from "@/components/source-pill";

interface HomeDashboardProps {
  globalContent: GlobalContent;
  countries: CountryContent[];
  themes: ThemeContent[];
  worldGeo: GeoFeatureCollection;
  quotes: QuoteItem[];
  focusIso?: string;
}

const regionOptions = [
  { key: "global", label: "Global" },
  { key: "africa", label: "Africa" },
  { key: "asia", label: "Asia" },
  { key: "latin_america", label: "Latin America" }
] as const;

const themeOrder = [
  "tenure-security",
  "climate-biodiversity",
  "women-youth-leadership",
  "learning-exchange",
  "community-led-finance",
  "technology-mapping",
  "policy-advocacy",
  "territorial-governance"
];

const GlobalMap = dynamic(
  () => import("@/components/global-map").then((module) => module.GlobalMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-wrap map-wrap--loading" role="status" aria-live="polite">
        <p className="note" style={{ padding: "1rem" }}>
          Loading global map…
        </p>
      </div>
    )
  }
);

export function HomeDashboard({
  globalContent,
  countries,
  themes,
  worldGeo,
  quotes,
  focusIso
}: HomeDashboardProps) {
  const router = useRouter();

  const [selectedThemeSlug, setSelectedThemeSlug] = useState<string>("tenure-security");
  const [selectedRegion, setSelectedRegion] = useState<(typeof regionOptions)[number]["key"]>("global");
  const [searchQuery, setSearchQuery] = useState("");

  const kpiDisplayLogic: NonNullable<GlobalContent["kpi_display_logic"]> = globalContent.kpi_display_logic ?? {
    default_theme_mode: "theme_native" as const,
    theme_modes: {
      "tenure-security": "hero_global_with_region_overrides" as const
    },
    regional_override_kpi_ids: ["hectares_positively_impacted"],
    regional_recomputed_kpi_ids: ["active_projects", "countries"],
    regional_recompute_scope: "visible_country_selection" as const
  };

  const selectedTheme =
    themes.find((theme) => theme.slug === selectedThemeSlug) ??
    themes.find((theme) => theme.slug === "tenure-security") ??
    themes[0];

  const selectedThemeMode =
    kpiDisplayLogic.theme_modes[selectedThemeSlug] ?? kpiDisplayLogic.default_theme_mode;

  const orderedThemes = useMemo(
    () =>
      themeOrder
        .map((slug) => themes.find((theme) => theme.slug === slug))
        .filter((theme): theme is ThemeContent => Boolean(theme)),
    [themes]
  );

  const themeCountryCounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const byThemeSlug: Record<string, number> = {};

    orderedThemes.forEach((theme) => {
      byThemeSlug[theme.slug] = countries.filter((country) => {
        if (selectedRegion !== "global" && country.region !== selectedRegion) {
          return false;
        }
        if (query && !country.name.toLowerCase().includes(query)) {
          return false;
        }
        return country.thematics.includes(theme.slug);
      }).length;
    });

    return byThemeSlug;
  }, [countries, orderedThemes, searchQuery, selectedRegion]);

  const visibleCountries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return countries.filter((country) => {
      if (selectedRegion !== "global" && country.region !== selectedRegion) {
        return false;
      }

      if (selectedThemeMode === "theme_native" && !country.thematics.includes(selectedThemeSlug)) {
        return false;
      }

      if (query && !country.name.toLowerCase().includes(query)) {
        return false;
      }

      return true;
    });
  }, [countries, searchQuery, selectedRegion, selectedThemeMode, selectedThemeSlug]);

  const displayedKpis = useMemo(() => {
    const themeMode =
      kpiDisplayLogic.theme_modes[selectedThemeSlug] ?? kpiDisplayLogic.default_theme_mode;

    if (themeMode === "theme_native") {
      return selectedTheme.kpis;
    }

    const baseKpis = [...globalContent.hero_kpis];
    const regional = globalContent.regional_kpis[selectedRegion];
    const totalProjects = visibleCountries.reduce((sum, country) => sum + country.project_count, 0);
    const activeCountries = visibleCountries.filter((country) => country.project_count > 0).length;

    return baseKpis.map((kpi) => {
      if (selectedRegion !== "global" && kpiDisplayLogic.regional_override_kpi_ids.includes(kpi.id)) {
        const regionalValue = (regional as Record<string, unknown>)[kpi.id];
        if (typeof regionalValue === "number") {
          return { ...kpi, value: regionalValue };
        }
      }

      if (selectedRegion !== "global" && kpiDisplayLogic.regional_recomputed_kpi_ids.includes(kpi.id)) {
        if (kpi.id === "active_projects") {
          return { ...kpi, value: totalProjects };
        }
        if (kpi.id === "countries") {
          return { ...kpi, value: activeCountries };
        }
      }

      return kpi;
    });
  }, [
    globalContent.hero_kpis,
    globalContent.regional_kpis,
    kpiDisplayLogic.default_theme_mode,
    kpiDisplayLogic.regional_override_kpi_ids,
    kpiDisplayLogic.regional_recomputed_kpi_ids,
    kpiDisplayLogic.theme_modes,
    selectedRegion,
    selectedTheme,
    selectedThemeSlug,
    visibleCountries
  ]);

  const derivationsByKpiId = useMemo(
    () =>
      Object.fromEntries(
        (globalContent.kpi_derivation_registry ?? []).map((entry) => [entry.kpi_id, entry])
      ),
    [globalContent.kpi_derivation_registry]
  );

  const themeMode = selectedThemeMode;

  const coverageNote =
    themeMode === "hero_global_with_region_overrides" && selectedRegion !== "global"
      ? globalContent.regional_kpis[selectedRegion].note
      : null;

  const tenureDefinition =
    globalContent.glossary.find((item) => item.term === "Securing tenure")?.definition ??
    "Securing tenure means supporting community-led pathways to strengthen rights over land and territory.";

  const editorialQuote = quotes.find((quote) => quote.id === "nonette-royo") ?? quotes[0] ?? {
    id: "fallback",
    text: "Tenure is a fundamental right that benefits us all.",
    attribution: "Tenure Facility",
    source_page: 18,
    theme: "tenure-security"
  };

  return (
    <div className="page-grid">
      <section className="panel panel--dark" aria-labelledby="home-title">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          Global Impact Interface
        </p>
        <h1 id="home-title" style={{ marginBottom: "0.6rem" }}>
          Tenure Facility Annual Report 2024
        </h1>
        <p>
          This platform transforms the annual report into a map-led editorial experience centered on land rights,
          territorial governance, climate and biodiversity, women and youth leadership, learning, and community-led
          finance.
        </p>
        <div className="controls-row" role="group" aria-label="Region filters" style={{ marginTop: "0.7rem" }}>
          {regionOptions.map((region) => (
            <button
              key={region.key}
              type="button"
              aria-pressed={selectedRegion === region.key}
              onClick={() => setSelectedRegion(region.key)}
            >
              {region.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="theme-selector-heading">
        <p className="section-kicker">Thematic Selector</p>
        <h2 id="theme-selector-heading">Filter the atlas by theme</h2>
        <div className="controls-row" role="group" aria-label="Theme filters">
          {orderedThemes.map((theme) => (
            <button
              key={theme.slug}
              type="button"
              aria-pressed={selectedThemeSlug === theme.slug}
              onClick={() => setSelectedThemeSlug(theme.slug)}
            >
              <span>{theme.name}</span>
              <span className="theme-count-badge" aria-label={`${themeCountryCounts[theme.slug] ?? 0} matching countries`}>
                {themeCountryCounts[theme.slug] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: "0.6rem" }}>
          {selectedTheme.description}
        </p>
      </section>

      <section className="panel" aria-labelledby="kpi-heading">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <h2 id="kpi-heading">KPI Strip</h2>
          <SourcePill page={themeMode === "hero_global_with_region_overrides" ? 9 : selectedTheme.source_pages[0]} />
        </div>
        <KpiStrip kpis={displayedKpis} derivationsByKpiId={derivationsByKpiId} />
        {coverageNote ? <p className="note">{coverageNote}</p> : null}
      </section>

      <section className="panel" aria-labelledby="map-heading">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
          <div>
            <p className="section-kicker">Global Footprint Map</p>
            <h2 id="map-heading">Where Tenure Facility worked in 2024</h2>
          </div>
          <SourcePill page={25} />
        </div>
        <p className="note">
          Click a country for a cinematic zoom into its story layer. Country labels include project counts from the
          report map.
        </p>
        <GlobalMap
          countries={visibleCountries}
          worldGeo={worldGeo}
          statusDefinitions={globalContent.status_definitions}
          onCountrySelect={(iso3) => router.push(`/countries/${iso3}`)}
          highlightedIso={focusIso}
        />
        <div className="controls-row" style={{ marginTop: "0.8rem" }}>
          {visibleCountries.slice(0, 18).map((country) => (
            <button key={country.iso3} type="button" onClick={() => router.push(`/countries/${country.iso3}`)}>
              {country.name} ({country.project_count})
            </button>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <SearchPanel
          query={searchQuery}
          onQueryChange={setSearchQuery}
          countries={countries}
          themes={themes}
        />
        <section className="panel panel--dark" aria-labelledby="narrative-heading">
          <p className="section-kicker" style={{ color: "#9fd6c9" }}>
            Narrative Module
          </p>
          <h2 id="narrative-heading">Stewarding land rights as a climate and democracy strategy</h2>
          <p>{tenureDefinition}</p>
          <p className="note" style={{ color: "rgba(240,233,220,0.82)" }}>
            Source: pages 22-23
          </p>
        </section>
      </div>

      <TimelineStrip milestones={globalContent.timeline} />

      <section className="editorial-break" aria-labelledby="chapter-transition-title">
        <Image
          className="editorial-break__image"
          src="/media/report-page-23.jpg"
          alt="Forest and river landscape representing territorial stewardship"
          fill
          sizes="(max-width: 760px) 100vw, 95vw"
        />
        <div className="editorial-break__veil" aria-hidden="true" />
        <div className="editorial-break__content">
          <p className="section-kicker" style={{ color: "#9fd6c9" }}>
            Chapter Transition
          </p>
          <h2 id="chapter-transition-title">Territories as Climate Frontlines</h2>
          <p>
            Indigenous Peoples, Afro-descendant Peoples, and local communities are not only rights-holders but primary
            guardians of biodiversity and climate stability. This platform keeps those territorial systems at the
            center of the narrative.
          </p>
          <div className="editorial-break__meta">
            <SourcePill page={23} />
            <SourcePill page={24} />
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="editorial-story-heading">
        <p className="section-kicker">Editorial Story Panel</p>
        <h2 id="editorial-story-heading">Voices from the report</h2>
        <div className="grid-2">
          <blockquote className="story-quote">
            "{editorialQuote.text}"
            <footer style={{ fontSize: "0.84rem", marginTop: "0.7rem" }}>
              {editorialQuote.attribution} <SourcePill page={editorialQuote.source_page} />
            </footer>
          </blockquote>
          <div>
            <Image
              src="/media/report-page-45.jpg"
              alt="Report image featuring leadership profile and climate narrative"
              width={960}
              height={680}
              sizes="(max-width: 1100px) 100vw, 48vw"
              style={{ borderRadius: "14px", border: "1px solid rgba(30,66,59,0.25)", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
