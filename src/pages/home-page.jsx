import { useEffect, useMemo, useState } from "react";
import {
  getChartBySlug,
  getCountries,
  getCountryGeo,
  getCountrySignalsByIso,
  getGlobalContent,
  getMediaIndex,
  getQuotes,
  getThemes,
  getWorldCountriesGeo,
  getWorldGeo
} from "../lib/content";
import { useAsyncData } from "../lib/use-async-data";
import { formatUnit } from "../lib/format";
import { mediaPath } from "../lib/paths";
import { KpiStrip } from "../components/kpi-strip";
import { TimelineStrip } from "../components/timeline-strip";
import { SearchPanel } from "../components/search-panel";
import { SourcePill } from "../components/source-pill";
import { GlobalMapD3 } from "../components/global-map-d3";
import { CountryFloatingOverlay } from "../components/country-floating-overlay";
import { CountryMapD3 } from "../components/country-map-d3";
import { FinancialChart } from "../components/financial-chart";
import { LoadingPanel, ErrorPanel } from "../components/loading-panel";

const regionOptions = [
  { key: "global", label: "Global" },
  { key: "africa", label: "Africa" },
  { key: "asia", label: "Asia" },
  { key: "latin_america", label: "Latin America" }
];

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

const fallbackKpiDisplayLogic = {
  default_theme_mode: "theme_native",
  theme_modes: {
    "tenure-security": "hero_global_with_region_overrides"
  },
  regional_override_kpi_ids: ["hectares_positively_impacted"],
  regional_recomputed_kpi_ids: ["active_projects", "countries"],
  regional_recompute_scope: "visible_country_selection"
};

const fallbackRegionalKpis = {
  global: { note: "" },
  africa: { note: "" },
  asia: { note: "" },
  latin_america: { note: "" }
};

const fallbackGlobalContent = {
  hero_kpis: [],
  regional_kpis: fallbackRegionalKpis,
  kpi_display_logic: fallbackKpiDisplayLogic,
  kpi_derivation_registry: [],
  glossary: [],
  timeline: [],
  status_definitions: []
};

const fallbackTheme = {
  slug: "tenure-security",
  name: "All Thematics",
  description: "",
  kpis: [],
  source_pages: [9],
  related_countries: [],
  related_stories: [],
  related_charts: []
};

const fallbackWorldGeo = {
  type: "FeatureCollection",
  features: []
};

function prettyMetricLabel(key) {
  return String(key)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetricValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined) {
    return "-";
  }

  return String(value);
}

function firstSourcePage(value, fallback = 25) {
  if (Array.isArray(value) && typeof value[0] === "number") {
    return value[0];
  }
  if (typeof value === "number") {
    return value;
  }
  return fallback;
}

function truncate(value, maxChars) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}

export function HomePage() {
  const searchParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

  const { loading, error, data } = useAsyncData(
    async () => {
      const [globalContent, countries, themes, worldGeo, worldCountriesGeo, quotes] = await Promise.all([
        getGlobalContent(),
        getCountries(),
        getThemes(),
        getWorldGeo(),
        getWorldCountriesGeo(),
        getQuotes()
      ]);

      return {
        globalContent,
        countries,
        themes,
        worldGeo,
        worldCountriesGeo,
        quotes: quotes.quotes
      };
    },
    []
  );

  const [selectedThemeSlug, setSelectedThemeSlug] = useState("tenure-security");
  const [selectedRegion, setSelectedRegion] = useState("global");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountryIso, setSelectedCountryIso] = useState(null);

  const { globalContent, countries, themes, worldGeo, worldCountriesGeo, quotes } = data ?? {
    globalContent: fallbackGlobalContent,
    countries: [],
    themes: [],
    worldGeo: fallbackWorldGeo,
    worldCountriesGeo: fallbackWorldGeo,
    quotes: []
  };

  const focusIso = searchParams.get("focus")?.toUpperCase();
  const focusThemeSlug = searchParams.get("theme")?.toLowerCase();

  const kpiDisplayLogic = globalContent.kpi_display_logic ?? fallbackKpiDisplayLogic;

  const selectedTheme =
    themes.find((theme) => theme.slug === selectedThemeSlug) ??
    themes.find((theme) => theme.slug === "tenure-security") ??
    themes[0] ??
    fallbackTheme;

  const selectedThemeMode =
    kpiDisplayLogic.theme_modes[selectedThemeSlug] ?? kpiDisplayLogic.default_theme_mode;

  const orderedThemes = useMemo(
    () =>
      themeOrder
        .map((slug) => themes.find((theme) => theme.slug === slug))
        .filter(Boolean),
    [themes]
  );

  const themeCountryCounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const byThemeSlug = {};

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
    const regional = globalContent.regional_kpis[selectedRegion] ?? globalContent.regional_kpis.global ?? {};
    const totalProjects = visibleCountries.reduce((sum, country) => sum + country.project_count, 0);
    const activeCountries = visibleCountries.filter((country) => country.project_count > 0).length;

    return baseKpis.map((kpi) => {
      if (selectedRegion !== "global" && kpiDisplayLogic.regional_override_kpi_ids.includes(kpi.id)) {
        const regionalValue = regional[kpi.id];
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
    () => Object.fromEntries((globalContent.kpi_derivation_registry ?? []).map((entry) => [entry.kpi_id, entry])),
    [globalContent.kpi_derivation_registry]
  );

  const coverageNote =
    selectedThemeMode === "hero_global_with_region_overrides" && selectedRegion !== "global"
      ? globalContent.regional_kpis[selectedRegion]?.note ?? null
      : null;

  const tenureDefinition =
    globalContent.glossary.find((item) => item.term === "Securing tenure")?.definition ??
    "Securing tenure means supporting community-led pathways to strengthen rights over land and territory.";

  const editorialQuote =
    quotes.find((quote) => quote.id === "nonette-royo") ??
    quotes[0] ?? {
      id: "fallback",
      text: "Tenure is a fundamental right that benefits us all.",
      attribution: "Tenure Facility",
      source_page: 18,
      theme: "tenure-security"
    };

  useEffect(() => {
    if (!focusIso) {
      return;
    }
    if (countries.some((country) => country.iso3 === focusIso)) {
      setSelectedCountryIso(focusIso);
    }
  }, [countries, focusIso]);

  useEffect(() => {
    if (!focusThemeSlug) {
      return;
    }

    if (themes.some((theme) => theme.slug === focusThemeSlug)) {
      setSelectedThemeSlug(focusThemeSlug);
    }
  }, [focusThemeSlug, themes]);

  useEffect(() => {
    if (!selectedCountryIso) {
      return;
    }
    if (!visibleCountries.some((country) => country.iso3 === selectedCountryIso)) {
      setSelectedCountryIso(null);
    }
  }, [selectedCountryIso, visibleCountries]);

  const selectedCountry = countries.find((country) => country.iso3 === selectedCountryIso) ?? null;
  const selectedCountryStatus =
    selectedCountry
      ? globalContent.status_definitions.find((definition) => definition.id === selectedCountry.status) ?? null
      : null;

  const {
    loading: countryDetailLoading,
    error: countryDetailError,
    data: countryDetailData
  } = useAsyncData(
    async () => {
      if (!selectedCountryIso) {
        return null;
      }

      const [boundaryGeo, territoryGeo, mediaIndex, countrySignals] = await Promise.all([
        getCountryGeo(selectedCountryIso, "boundary"),
        getCountryGeo(selectedCountryIso, "territories"),
        getMediaIndex(),
        getCountrySignalsByIso(selectedCountryIso)
      ]);

      return {
        boundaryGeo,
        territoryGeo,
        mediaIndex,
        countrySignals
      };
    },
    [selectedCountryIso]
  );

  const {
    loading: themeDetailLoading,
    error: themeDetailError,
    data: themeDetailData
  } = useAsyncData(
    async () => {
      if (!selectedTheme?.slug || !countries.length) {
        return {
          relatedCountries: [],
          relatedCountrySignals: [],
          relatedCharts: []
        };
      }

      const relatedCountries = countries.filter((country) =>
        (selectedTheme.related_countries ?? []).includes(country.iso3)
      );

      const [relatedCountrySignals, relatedCharts] = await Promise.all([
        Promise.all(relatedCountries.map((country) => getCountrySignalsByIso(country.iso3))).then((items) =>
          items.filter(Boolean)
        ),
        Promise.all((selectedTheme.related_charts ?? []).map((chartSlug) => getChartBySlug(chartSlug))).then((items) =>
          items.filter(Boolean)
        )
      ]);

      return {
        relatedCountries,
        relatedCountrySignals,
        relatedCharts
      };
    },
    [selectedTheme?.slug, countries]
  );

  const relatedCountries = themeDetailData?.relatedCountries ?? [];
  const relatedCountrySignals = themeDetailData?.relatedCountrySignals ?? [];
  const relatedCharts = themeDetailData?.relatedCharts ?? [];

  const themeSignalKpis = useMemo(
    () =>
      relatedCountrySignals
        .flatMap((countrySignals) =>
          countrySignals.kpis
            .filter((kpi) => kpi.theme_tags.includes(selectedTheme.slug))
            .map((kpi) => ({ ...kpi, iso3: countrySignals.iso3, country_name: countrySignals.country_name }))
        )
        .slice(0, 18),
    [relatedCountrySignals, selectedTheme.slug]
  );

  const themeSignalNarratives = useMemo(
    () =>
      relatedCountrySignals
        .flatMap((countrySignals) =>
          countrySignals.narratives
            .filter((entry) => entry.theme_tags.includes(selectedTheme.slug))
            .map((entry) => ({ ...entry, iso3: countrySignals.iso3, country_name: countrySignals.country_name }))
        )
        .slice(0, 14),
    [relatedCountrySignals, selectedTheme.slug]
  );

  const primaryThemeSignalKpis = themeSignalKpis.slice(0, 8);
  const overflowThemeSignalKpis = themeSignalKpis.slice(8);
  const primaryThemeSignalNarratives = themeSignalNarratives.slice(0, 6);
  const overflowThemeSignalNarratives = themeSignalNarratives.slice(6);

  const sourcePagesForThemeSignals = useMemo(
    () =>
      Array.from(new Set([...themeSignalKpis.map((kpi) => kpi.source_page), ...themeSignalNarratives.map((entry) => entry.source_page)])).sort(
        (left, right) => left - right
      ),
    [themeSignalKpis, themeSignalNarratives]
  );

  const selectedCountrySignals = countryDetailData?.countrySignals ?? null;

  const selectedCountryPhotos = useMemo(() => {
    if (!selectedCountry || !countryDetailData?.mediaIndex) {
      return [];
    }

    return (selectedCountry.media?.photos ?? [])
      .map((file) => countryDetailData.mediaIndex.photos.find((photo) => photo.file === file))
      .filter(Boolean);
  }, [countryDetailData?.mediaIndex, selectedCountry]);

  const sourcePageRaw = selectedCountry?.metrics?.source_page;
  const selectedCountrySourcePage = firstSourcePage(sourcePageRaw, 25);

  const selectedCountrySignalKpis = (selectedCountrySignals?.kpis ?? []).slice(0, 10);
  const selectedCountrySignalNarratives = (selectedCountrySignals?.narratives ?? []).slice(0, 7);
  const primaryCountrySignalKpis = selectedCountrySignalKpis.slice(0, 5);
  const overflowCountrySignalKpis = selectedCountrySignalKpis.slice(5);
  const primaryCountrySignalNarratives = selectedCountrySignalNarratives.slice(0, 4);
  const overflowCountrySignalNarratives = selectedCountrySignalNarratives.slice(4);

  if (loading) {
    return <LoadingPanel label="Loading global impact dashboard..." />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load home dashboard data." />;
  }

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
              <span
                className="theme-count-badge"
                aria-label={`${themeCountryCounts[theme.slug] ?? 0} matching countries`}
              >
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
          <SourcePill page={selectedThemeMode === "hero_global_with_region_overrides" ? 9 : selectedTheme.source_pages?.[0] ?? 9} />
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
          All countries are rendered in the atlas. Portfolio countries are color-coded by implementation status and
          open in-place floating cards with integrated detail links.
        </p>
        <GlobalMapD3
          allCountries={countries}
          visibleCountries={visibleCountries}
          worldFootprintGeo={worldGeo}
          worldCountriesGeo={worldCountriesGeo}
          statusDefinitions={globalContent.status_definitions}
          selectedIso={selectedCountry?.iso3 ?? null}
          onCountrySelect={setSelectedCountryIso}
          onClearSelection={() => setSelectedCountryIso(null)}
          highlightedIso={focusIso}
          overlay={
            selectedCountry ? (
              <CountryFloatingOverlay
                country={selectedCountry}
                statusInfo={selectedCountryStatus}
                onThemeSelect={(themeSlug) => setSelectedThemeSlug(themeSlug)}
                onClose={() => setSelectedCountryIso(null)}
              />
            ) : null
          }
        />
        <div className="controls-row" style={{ marginTop: "0.8rem" }}>
          {visibleCountries.slice(0, 18).map((country) => (
            <button key={country.iso3} type="button" onClick={() => setSelectedCountryIso(country.iso3)}>
              {country.name} ({country.project_count})
            </button>
          ))}
        </div>
      </section>

      <section className="panel" id="theme-details" aria-labelledby="theme-details-heading">
        <p className="section-kicker">Integrated thematic detail</p>
        <h2 id="theme-details-heading">{selectedTheme.name}</h2>
        <p>{selectedTheme.description}</p>
        <p className="note">Source pages: {(selectedTheme.source_pages ?? []).join(", ") || "N/A"}</p>

        <div style={{ marginTop: "0.8rem" }}>
          <h3 style={{ marginBottom: "0.45rem" }}>Theme KPI set</h3>
          <KpiStrip kpis={selectedTheme.kpis ?? []} derivationsByKpiId={derivationsByKpiId} />
        </div>

        {themeDetailLoading ? <p className="note" style={{ marginTop: "0.7rem" }}>Loading thematic evidence...</p> : null}
        {themeDetailError ? (
          <p className="note" style={{ marginTop: "0.7rem" }}>
            Unable to load supplementary thematic evidence right now.
          </p>
        ) : null}

        <div className="grid-2" style={{ marginTop: "0.8rem" }}>
          <article>
            <h3>Related countries</h3>
            <ul>
              {relatedCountries.map((country) => (
                <li key={country.iso3}>
                  <button type="button" onClick={() => setSelectedCountryIso(country.iso3)}>
                    {country.name}
                  </button>{" "}
                  | {country.project_count} projects |{" "}
                  <SourcePill
                    page={
                      Array.isArray(country.metrics?.source_page)
                        ? country.metrics.source_page[0]
                        : country.metrics?.source_page
                    }
                  />
                </li>
              ))}
              {!relatedCountries.length ? <li className="note">No related countries listed for this theme.</li> : null}
            </ul>
          </article>

          <article>
            <h3>Related stories</h3>
            <ul>
              {(selectedTheme.related_stories ?? []).map((story) => (
                <li key={story}>{story}</li>
              ))}
              {!selectedTheme.related_stories?.length ? (
                <li className="note">No related stories configured for this theme.</li>
              ) : null}
            </ul>
            <p className="note" style={{ marginTop: "0.5rem" }}>
              Source anchors: {(selectedTheme.source_pages ?? []).join(", ")}
            </p>
          </article>
        </div>

        {themeSignalKpis.length || themeSignalNarratives.length ? (
          <section style={{ marginTop: "0.9rem" }}>
            <h3>Extracted cross-country evidence</h3>
            <p className="note">
              Supplementary evidence signals normalized from `tenure_facility_country_jsons_v4`, filtered to this
              active theme.
            </p>
            <div className="grid-2" style={{ marginTop: "0.45rem" }}>
              <article>
                <h4>Signal KPIs</h4>
                <ul>
                  {primaryThemeSignalKpis.length ? (
                    primaryThemeSignalKpis.map((kpi) => (
                      <li key={`${kpi.iso3}-${kpi.id}`}>
                        <strong>{kpi.country_name}:</strong> {kpi.label} = {formatUnit(kpi.value, kpi.unit)}{" "}
                        <SourcePill page={kpi.source_page} />
                      </li>
                    ))
                  ) : (
                    <li>No extracted KPI signals matched this theme.</li>
                  )}
                </ul>
                {overflowThemeSignalKpis.length ? (
                  <details className="inline-disclosure">
                    <summary>Show {overflowThemeSignalKpis.length} more signal KPIs</summary>
                    <ul style={{ marginTop: "0.35rem" }}>
                      {overflowThemeSignalKpis.map((kpi) => (
                        <li key={`${kpi.iso3}-${kpi.id}`}>
                          <strong>{kpi.country_name}:</strong> {kpi.label} <SourcePill page={kpi.source_page} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>

              <article>
                <h4>Signal narratives</h4>
                <ul>
                  {primaryThemeSignalNarratives.length ? (
                    primaryThemeSignalNarratives.map((entry) => (
                      <li key={`${entry.iso3}-${entry.kind}-${entry.id}`}>
                        <strong>{entry.country_name}:</strong> {entry.title} <SourcePill page={entry.source_page} />
                      </li>
                    ))
                  ) : (
                    <li>No extracted narratives matched this theme.</li>
                  )}
                </ul>
                {overflowThemeSignalNarratives.length ? (
                  <details className="inline-disclosure">
                    <summary>Show {overflowThemeSignalNarratives.length} more signal narratives</summary>
                    <ul style={{ marginTop: "0.35rem" }}>
                      {overflowThemeSignalNarratives.map((entry) => (
                        <li key={`${entry.iso3}-${entry.kind}-${entry.id}`}>
                          <strong>{entry.country_name}:</strong> {entry.title} <SourcePill page={entry.source_page} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            </div>
            {sourcePagesForThemeSignals.length ? (
              <p className="note" style={{ marginTop: "0.6rem" }}>
                Theme signal source pages: {sourcePagesForThemeSignals.join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}
      </section>

      {relatedCharts.length ? (
        <section className="page-grid" aria-label={`${selectedTheme.name} related charts`}>
          {relatedCharts.map((chart) => (
            <FinancialChart key={chart.slug} chart={chart} />
          ))}
        </section>
      ) : null}

      {selectedCountry ? (
        <section className="country-scene" id="country-details" aria-labelledby="country-details-heading">
          <div
            className="country-backdrop"
            style={{
              backgroundImage: `url(${mediaPath(selectedCountryPhotos[0]?.file ?? "report-page-23.jpg")})`
            }}
            aria-hidden="true"
          />
          <div className="country-content">
            <div style={{ display: "grid", gap: "1rem" }}>
              <article className="float-card">
                <p className="section-kicker" style={{ color: "#9fd6c9" }}>
                  Integrated country detail
                </p>
                <h2 id="country-details-heading">{selectedCountry.name}</h2>
                <p style={{ marginTop: "0.7rem" }}>{selectedCountry.summary}</p>
                <p className="note" style={{ color: "rgba(246,236,215,0.82)" }}>
                  Status: {selectedCountryStatus?.label ?? selectedCountry.status} | Project count: {selectedCountry.project_count}
                </p>
                <div className="tag-row" style={{ marginTop: "0.5rem" }}>
                  {(selectedCountry.thematics ?? []).map((themeSlug) => (
                    <button
                      key={themeSlug}
                      type="button"
                      className="tag tag-button"
                      onClick={() => setSelectedThemeSlug(themeSlug)}
                    >
                      {themeSlug.replaceAll("-", " ")}
                    </button>
                  ))}
                </div>
              </article>

              <article className="float-card">
                <h3>Impact highlights</h3>
                <ul>
                  {(selectedCountry.featured_achievements ?? []).map((achievement) => (
                    <li key={achievement}>{achievement}</li>
                  ))}
                </ul>
                <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                  Source pages: {Array.isArray(sourcePageRaw) ? sourcePageRaw.join(", ") : sourcePageRaw}
                </p>
              </article>

              <article className="float-card">
                <h3>Key metrics</h3>
                <ul>
                  {Object.entries(selectedCountry.metrics ?? {})
                    .filter(([key]) => key !== "source_page")
                    .map(([key, value]) => (
                      <li key={key}>
                        <strong>{prettyMetricLabel(key)}:</strong> {formatMetricValue(value)}
                      </li>
                    ))}
                </ul>
              </article>

              <article className="float-card">
                <h3>Project portfolio</h3>
                <ul>
                  {(selectedCountry.projects ?? []).map((project) => (
                    <li key={project.project_id}>
                      <strong>{project.project_name}</strong> ({project.project_id}) | {project.lifecycle_status} |{" "}
                      {project.implementation_status}
                      <br />
                      <span>{project.summary}</span>
                    </li>
                  ))}
                </ul>
                <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                  Project-level data model introduced in Phase 1. Values are placeholder-seeded pending verified
                  project records.
                </p>
              </article>

              {selectedCountrySignals ? (
                <article className="float-card">
                  <h3>Extracted KPI signals</h3>
                  <ul>
                    {primaryCountrySignalKpis.map((kpi) => (
                      <li key={kpi.id}>
                        <strong>{kpi.label}:</strong> {formatUnit(kpi.value, kpi.unit)}{" "}
                        <SourcePill page={kpi.source_page} />
                        <br />
                        <span className="note" style={{ color: "rgba(243,232,210,0.75)" }}>
                          {kpi.metric_family} | {kpi.direction} | {kpi.theme_tags.join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {overflowCountrySignalKpis.length ? (
                    <details className="inline-disclosure">
                      <summary>Show {overflowCountrySignalKpis.length} more KPI signals</summary>
                      <ul style={{ marginTop: "0.4rem" }}>
                        {overflowCountrySignalKpis.map((kpi) => (
                          <li key={kpi.id}>
                            <strong>{kpi.label}:</strong> {formatUnit(kpi.value, kpi.unit)}{" "}
                            <SourcePill page={kpi.source_page} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                    Supplemental extracted evidence from `tenure_facility_country_jsons_v4`.{" "}
                    {selectedCountrySignals.status_mismatch
                      ? `Status requires review (mapped: ${selectedCountrySignals.mapped_status}, live: ${selectedCountrySignals.live_status}).`
                      : "Status mapping aligns with live country record."}
                  </p>
                </article>
              ) : null}

              <article className="float-card">
                <h3>Partners</h3>
                <p>{(selectedCountry.partners ?? []).join(" | ")}</p>
                <p className="story-quote" style={{ fontSize: "1.06rem", marginTop: "0.8rem" }}>
                  "{selectedCountry.quote?.text}"
                </p>
                <p className="note" style={{ color: "rgba(245,235,217,0.72)" }}>
                  {selectedCountry.quote?.attribution} <SourcePill page={selectedCountry.quote?.source_page} />
                </p>
              </article>
            </div>

            <div style={{ display: "grid", gap: "1rem", alignContent: "start" }}>
              <article className="float-card">
                <h3>Project geography</h3>
                <p className="note" style={{ color: "rgba(243,232,210,0.8)" }}>
                  Authoritative country boundaries are paired with territory overlays for protected or governed areas.
                </p>

                {countryDetailLoading ? (
                  <p className="note" style={{ color: "rgba(243,232,210,0.8)" }}>
                    Loading geographic layers...
                  </p>
                ) : null}

                {countryDetailError ? (
                  <p className="note" style={{ color: "rgba(243,232,210,0.8)" }}>
                    Geographic overlays are unavailable for this country right now.
                  </p>
                ) : null}

                <CountryMapD3
                  boundaryGeo={countryDetailData?.boundaryGeo ?? fallbackWorldGeo}
                  territoryGeo={countryDetailData?.territoryGeo ?? fallbackWorldGeo}
                />
                <p className="note" style={{ color: "rgba(243,232,210,0.7)", marginTop: "0.5rem" }}>
                  Boundary source: geo/countries_manifest.json | Territory overlays: supplemental GeoJSON |{" "}
                  <SourcePill page={selectedCountrySourcePage} />
                </p>
              </article>

              <article className="float-card">
                <h3>Stories from the report</h3>
                <ul>
                  {(selectedCountry.stories ?? []).map((story) => (
                    <li key={story.title ?? story}>
                      <strong>{story.title ?? "Story"}:</strong> {story.summary ?? String(story)}{" "}
                      {story.source_page ? <SourcePill page={story.source_page} /> : null}
                    </li>
                  ))}
                </ul>
              </article>

              {selectedCountrySignals ? (
                <article className="float-card">
                  <h3>Additional narrative evidence</h3>
                  <ul>
                    {primaryCountrySignalNarratives.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <strong>{item.title}</strong> ({item.kind.replaceAll("_", " ")}){" "}
                        <SourcePill page={item.source_page} />
                        <br />
                        <span>{truncate(item.body, 240)}</span>
                      </li>
                    ))}
                  </ul>
                  {overflowCountrySignalNarratives.length ? (
                    <details className="inline-disclosure">
                      <summary>Show {overflowCountrySignalNarratives.length} more narratives</summary>
                      <ul style={{ marginTop: "0.4rem" }}>
                        {overflowCountrySignalNarratives.map((item) => (
                          <li key={`${item.kind}-${item.id}`}>
                            <strong>{item.title}</strong> <SourcePill page={item.source_page} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                    Source pages covered by extracted signals: {(selectedCountrySignals.source_pages ?? []).join(", ")}.
                  </p>
                </article>
              ) : null}

              <article className="float-card">
                <h3>Photo gallery</h3>
                <div className="media-grid">
                  {selectedCountryPhotos.length ? (
                    selectedCountryPhotos.map((photo) => (
                      <figure key={photo.id}>
                        <img src={mediaPath(photo.file)} alt={photo.alt} className="media-grid__image" />
                        <figcaption>
                          {photo.caption} <SourcePill page={photo.source_page} />
                        </figcaption>
                      </figure>
                    ))
                  ) : (
                    <p className="note">No image assets linked for this country yet.</p>
                  )}
                </div>
              </article>

              {selectedCountry.media?.videos?.length ? (
                <article className="float-card">
                  <h3>Video</h3>
                  {selectedCountry.media.videos.map((video) => (
                    <div key={video.url}>
                      <p>{video.title}</p>
                      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%" }}>
                        <iframe
                          src={video.url}
                          title={video.title}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            border: 0,
                            borderRadius: "12px"
                          }}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                      <p className="note" style={{ color: "rgba(243,232,210,0.7)" }}>
                        <SourcePill page={video.source_page} />
                      </p>
                    </div>
                  ))}
                </article>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="panel" id="country-details" aria-labelledby="country-details-placeholder-heading">
          <p className="section-kicker">Country details</p>
          <h2 id="country-details-placeholder-heading">Select a country from the map to view full integrated details</h2>
          <p className="note">
            Country-specific story, KPI signals, geography overlays, project portfolio, and media now render directly on
            Home below the map.
          </p>
        </section>
      )}

      <div className="grid-2">
        <SearchPanel
          query={searchQuery}
          onQueryChange={setSearchQuery}
          countries={countries}
          themes={themes}
          onCountrySelect={(iso3) => setSelectedCountryIso(iso3)}
          onThemeSelect={(slug) => setSelectedThemeSlug(slug)}
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
        <img
          className="editorial-break__image"
          src={mediaPath("report-page-23.jpg")}
          alt="Forest and river landscape representing territorial stewardship"
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
            <img
              src={mediaPath("report-page-45.jpg")}
              alt="Report image featuring leadership profile and climate narrative"
              style={{ borderRadius: "14px", border: "1px solid rgba(30,66,59,0.25)", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
