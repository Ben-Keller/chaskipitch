import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalMapD3 } from "./global-map-d3";
import { KpiStrip } from "./kpi-strip";
import { LoadingPanel, ErrorPanel } from "./loading-panel";
import {
  getCountryEvidenceByIso,
  getCountryVideoIndex,
  getCountryGeo,
  getCountries,
  getGlobalContent,
  getPhotoAssignments,
  getQuotes,
  getThemes,
  getWorldCountriesGeo,
  getWorldGeo
} from "../lib/content";
import { formatUnit } from "../lib/format";
import { useAsyncData } from "../lib/use-async-data";
import {
  AtlasContextPhoto,
  buildCountryKpis,
  buildCountryVideos,
  buildEvidenceExcerpts,
  buildEvidenceHighlights,
  buildEvidenceKpis,
  fallbackCountryEvidence,
  fallbackCountryVideoIndex,
  fallbackGeoCollection,
  fallbackGlobalContent,
  fallbackKpiDisplayLogic,
  fallbackPhotoAssignments,
  fallbackTheme,
  fallbackWorldGeo,
  regionOptions,
  resolveMediaPath,
  themeOrder
} from "./dashboard-support";

export function DashboardPage() {
  const loadDashboardData = useCallback(async () => {
    const [
      globalContent,
      countries,
      themes,
      worldGeo,
      worldCountriesGeo,
      quotes,
      countryVideoIndex,
      photoAssignments
    ] = await Promise.all([
      getGlobalContent(),
      getCountries(),
      getThemes(),
      getWorldGeo(),
      getWorldCountriesGeo(),
      getQuotes(),
      getCountryVideoIndex(),
      getPhotoAssignments()
    ]);

    return {
      globalContent,
      countries,
      themes,
      worldGeo,
      worldCountriesGeo,
      quotes: quotes.quotes,
      countryVideoIndex,
      photoAssignments
    };
  }, []);
  const { loading, error, data } = useAsyncData(loadDashboardData);

  const [selectedThemeSlug, setSelectedThemeSlug] = useState("tenure-security");
  const [selectedRegion, setSelectedRegion] = useState("global");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountryIso, setSelectedCountryIso] = useState(null);
  const [selectedTerritoryGeo, setSelectedTerritoryGeo] = useState(fallbackGeoCollection);
  const [selectedCountryEvidence, setSelectedCountryEvidence] = useState(fallbackCountryEvidence);
  const contextCardRef = useRef(null);

  const { globalContent, countries, themes, worldGeo, worldCountriesGeo, quotes, countryVideoIndex, photoAssignments } =
    data ?? {
    globalContent: fallbackGlobalContent,
    countries: [],
    themes: [],
    worldGeo: fallbackWorldGeo,
    worldCountriesGeo: fallbackWorldGeo,
    quotes: [],
    countryVideoIndex: fallbackCountryVideoIndex,
    photoAssignments: fallbackPhotoAssignments
  };

  const kpiDisplayLogic = globalContent.kpi_display_logic ?? fallbackKpiDisplayLogic;

  const selectedTheme =
    themes.find((theme) => theme.slug === selectedThemeSlug) ??
    themes.find((theme) => theme.slug === "tenure-security") ??
    themes[0] ??
    fallbackTheme;

  const orderedThemes = useMemo(
    () =>
      themeOrder
        .map((slug) => themes.find((theme) => theme.slug === slug))
        .filter(Boolean),
    [themes]
  );

  const selectedThemeMode =
    kpiDisplayLogic.theme_modes[selectedThemeSlug] ?? kpiDisplayLogic.default_theme_mode;

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

  useEffect(() => {
    if (!selectedCountryIso) {
      return;
    }
    if (!countries.some((country) => country.iso3 === selectedCountryIso)) {
      setSelectedCountryIso(null);
    }
  }, [countries, selectedCountryIso]);

  useEffect(() => {
    if (!selectedCountryIso) {
      return;
    }
    if (!visibleCountries.some((country) => country.iso3 === selectedCountryIso)) {
      setSelectedCountryIso(null);
    }
  }, [selectedCountryIso, visibleCountries]);

  const selectedCountry =
    countries.find((country) => country.iso3 === selectedCountryIso) ?? null;

  const selectedCountryThemes = useMemo(
    () => new Set(selectedCountry?.thematics ?? []),
    [selectedCountry]
  );

  const selectedCountryEvidenceExcerpts = useMemo(
    () => buildEvidenceExcerpts(selectedCountryEvidence),
    [selectedCountryEvidence]
  );

  const selectedCountryEvidenceHighlights = useMemo(
    () => buildEvidenceHighlights(selectedCountryEvidence),
    [selectedCountryEvidence]
  );

  useEffect(() => {
    let active = true;

    if (!selectedCountryIso) {
      setSelectedTerritoryGeo(fallbackGeoCollection);
      return () => {
        active = false;
      };
    }

    setSelectedTerritoryGeo(fallbackGeoCollection);

    getCountryGeo(selectedCountryIso, "territories")
      .then((payload) => {
        if (!active) {
          return;
        }
        setSelectedTerritoryGeo(payload?.features?.length ? payload : fallbackGeoCollection);
      })
      .catch(() => {
        if (active) {
          setSelectedTerritoryGeo(fallbackGeoCollection);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedCountryIso]);

  useEffect(() => {
    let active = true;

    if (!selectedCountryIso) {
      setSelectedCountryEvidence(fallbackCountryEvidence);
      return () => {
        active = false;
      };
    }

    setSelectedCountryEvidence(fallbackCountryEvidence);

    getCountryEvidenceByIso(selectedCountryIso)
      .then((payload) => {
        if (!active) {
          return;
        }
        setSelectedCountryEvidence(payload ?? fallbackCountryEvidence);
      })
      .catch(() => {
        if (active) {
          setSelectedCountryEvidence(fallbackCountryEvidence);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedCountryIso]);

  const countryPhotoByIso = useMemo(() => {
    const entries = Object.entries(photoAssignments?.country_photos ?? {}).map(([iso3, media]) => [
      String(iso3).trim().toUpperCase(),
      media
    ]);
    return new Map(entries);
  }, [photoAssignments?.country_photos]);

  const countryPhotoPool = useMemo(
    () => [...countryPhotoByIso.values()].filter((media) => typeof media?.image === "string" && media.image.length > 0),
    [countryPhotoByIso]
  );

  const selectedCountryPhoto = selectedCountry?.iso3
    ? countryPhotoByIso.get(String(selectedCountry.iso3).toUpperCase()) ?? null
    : null;

  const selectedCountryPhotoFallback = useMemo(() => {
    if (!selectedCountry || selectedCountryPhoto || !countryPhotoPool.length) {
      return null;
    }
    const hash = [...String(selectedCountry.iso3)]
      .map((char) => char.charCodeAt(0))
      .reduce((sum, code) => sum + code, 0);
    return countryPhotoPool[hash % countryPhotoPool.length] ?? null;
  }, [countryPhotoPool, selectedCountry, selectedCountryPhoto]);

  const selectedThemeMedia = photoAssignments?.theme_media?.[selectedTheme.slug] ?? null;
  const selectedThemeImage = resolveMediaPath(selectedThemeMedia?.image);
  const selectedThemeTextureBySlug = useMemo(() => {
    const entries = Object.entries(photoAssignments?.theme_media ?? {}).map(([slug, media]) => [
      slug,
      resolveMediaPath(media?.texture)
    ]);
    return new Map(entries);
  }, [photoAssignments?.theme_media]);

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

  const activeKpis = selectedCountry
    ? buildCountryKpis(selectedCountry)
    : displayedKpis.slice(0, 6);

  const selectedCountryVideos = useMemo(
    () => buildCountryVideos(selectedCountry, countryVideoIndex),
    [selectedCountry, countryVideoIndex]
  );

  const editorialQuote = quotes.find((quote) => quote.theme === selectedTheme.slug) ??
    quotes[0] ?? {
      text: "Tenure is a fundamental right that benefits people and planet.",
      attribution: "Tenure Facility",
      source_page: 18
    };

  const heroKpisById = useMemo(
    () => new Map((globalContent.hero_kpis ?? []).map((kpi) => [kpi.id, kpi])),
    [globalContent.hero_kpis]
  );

  const allThematicsScopeBullets = useMemo(() => {
    const hectares = heroKpisById.get("hectares_positively_impacted");
    const communities = heroKpisById.get("communities_positively_impacted");
    const projects = heroKpisById.get("active_projects");
    const countriesKpi = heroKpisById.get("countries");
    const bullets = [];

    if (hectares) {
      bullets.push(`${formatUnit(hectares.value, hectares.unit)} positively impacted.`);
    }
    if (communities) {
      bullets.push(`${formatUnit(communities.value, communities.unit)} positively impacted.`);
    }
    if (projects && countriesKpi) {
      bullets.push(`${formatUnit(projects.value, projects.unit)} in ${formatUnit(countriesKpi.value, countriesKpi.unit)}.`);
    }

    return bullets;
  }, [heroKpisById]);

  const allThematicsPillarsLabel = useMemo(
    () =>
      (globalContent.about?.pillars ?? [])
        .map((pillar) => pillar.title)
        .filter(Boolean)
        .join(" | "),
    [globalContent.about?.pillars]
  );

  const isAllThematicsOverview = !selectedCountry && selectedTheme.slug === "tenure-security";

  useEffect(() => {
    if (contextCardRef.current) {
      contextCardRef.current.scrollTop = 0;
    }
  }, [selectedCountryIso, selectedThemeSlug]);

  if (loading) {
    return <LoadingPanel label="Loading impact workspace..." />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load impact workspace data." />;
  }

  return (
    <div className="impact-atlas-shell">
      <section className="impact-atlas-stage" aria-label="Interactive global footprint atlas">
        <GlobalMapD3
          allCountries={countries}
          visibleCountries={visibleCountries}
          selectedRegion={selectedRegion}
          worldFootprintGeo={worldGeo}
          worldCountriesGeo={worldCountriesGeo}
          statusDefinitions={globalContent.status_definitions}
          selectedIso={selectedCountry?.iso3 ?? null}
          selectedTerritoryGeo={selectedTerritoryGeo}
          onCountrySelect={setSelectedCountryIso}
          onClearSelection={() => {
            setSelectedCountryIso(null);
            setSelectedRegion("global");
            setSelectedThemeSlug("tenure-security");
          }}
          overlay={
            <div className="atlas-overlay-layer">
              <section className="atlas-top-deck" aria-label="Atlas header, filters, and key indicators">
                <div className="atlas-top-deck__head">
                  <article className="atlas-figure-intro">
                    <p className="atlas-figure-intro__kicker">Where Do We Work</p>
                    <h1>Tenure Facility&apos;s Global Footprint in 2024</h1>
                    <p>
                      As of December 31, 2024, Tenure Facility supported 35 projects in 18 countries with project
                      preparation grants in 3 countries.
                    </p>
                    <div className="atlas-region-controls">
                      <div className="atlas-region-tabs atlas-region-tabs--intro" role="group" aria-label="Region filter">
                        {regionOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            className={selectedRegion === option.key ? "is-active" : ""}
                            onClick={() => {
                              setSelectedRegion(option.key);
                              setSelectedCountryIso(null);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search countries"
                        aria-label="Search countries"
                      />
                    </div>
                  </article>

                  <div className="atlas-search-region" aria-label="Country and regional filters">
                    <div className="atlas-kpi-ribbon atlas-kpi-ribbon--inline">
                      <KpiStrip kpis={activeKpis} />
                    </div>
                  </div>
                </div>

                <div className="atlas-theme-ribbon" role="group" aria-label="Theme mode filters">
                  <div className="atlas-theme-grid">
                    {orderedThemes.map((theme) => (
                      <button
                        key={theme.slug}
                        type="button"
                        className={[
                          selectedThemeSlug === theme.slug ? "is-active" : "",
                          selectedCountryThemes.has(theme.slug) ? "is-country-theme" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setSelectedThemeSlug(theme.slug)}
                        style={{
                          "--theme-texture-url": selectedThemeTextureBySlug.get(theme.slug)
                            ? `url(${selectedThemeTextureBySlug.get(theme.slug)})`
                            : "none"
                        }}
                      >
                        {theme.name}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <aside ref={contextCardRef} className="atlas-context-card" aria-label="Theme and country context">
                {selectedCountry ? (
                  <>
                    <h2>{selectedCountry.name}</h2>
                    {(selectedCountryPhoto?.image || selectedCountryPhotoFallback?.image || selectedThemeMedia?.image) ? (
                      <AtlasContextPhoto
                        src={resolveMediaPath(
                          selectedCountryPhoto?.image || selectedCountryPhotoFallback?.image || selectedThemeMedia?.image
                        )}
                        fallbackSrc={selectedThemeImage || ""}
                        alt={
                          selectedCountryPhoto?.alt ||
                          selectedCountryPhotoFallback?.alt ||
                          selectedThemeMedia?.alt ||
                          `${selectedCountry.name} photo`
                        }
                      />
                    ) : null}
                    <p>{selectedCountry.summary}</p>
                    <ul>
                      {selectedCountry.featured_achievements.slice(0, 3).map((achievement) => (
                        <li key={achievement}>{achievement}</li>
                      ))}
                    </ul>
                    {selectedCountryEvidenceHighlights.length ? (
                      <section className="atlas-context-evidence" aria-label={`${selectedCountry.name} report highlights`}>
                        <h3>Additional highlights</h3>
                        <ul>
                          {selectedCountryEvidenceHighlights.map((highlight) => (
                            <li key={highlight.id}>{highlight.text}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {selectedCountryEvidence.organization_mentions?.length ? (
                      <p className="note">
                        Organizations mentioned: {selectedCountryEvidence.organization_mentions.slice(0, 6).join(", ")}
                      </p>
                    ) : null}
                    {selectedCountryVideos.length ? (
                      <section className="atlas-context-videos" aria-label={`${selectedCountry.name} videos`}>
                        <h3>Country Videos</h3>
                        {selectedCountryVideos.some((video) => video.isFallback) ? (
                          <p className="note">No direct country-tagged video was found; showing latest Tenure Facility videos.</p>
                        ) : null}
                        <div className="atlas-context-videos__list">
                          {selectedCountryVideos.map((video) => (
                            <a
                              key={`${video.watchUrl || video.embedUrl}-${video.title}`}
                              className="atlas-context-video-item"
                              href={video.watchUrl || video.embedUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {video.thumbnail ? (
                                <img
                                  src={resolveMediaPath(video.thumbnail)}
                                  alt={`Video thumbnail for ${video.title}`}
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="atlas-context-video-item__placeholder" aria-hidden="true">
                                  Video
                                </div>
                              )}
                              <span>{video.title}</span>
                            </a>
                          ))}
                        </div>
                      </section>
                    ) : (
                      <p className="note">No country-specific videos are linked yet for this country.</p>
                    )}
                    {selectedCountryEvidenceExcerpts.length ? (
                      <section className="atlas-context-evidence" aria-label={`${selectedCountry.name} report excerpts`}>
                        <h3>Report excerpts</h3>
                        <ul>
                          {selectedCountryEvidenceExcerpts.map((excerpt) => (
                            <li key={excerpt.id}>
                              <strong>{excerpt.title}</strong> {excerpt.description}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h2>{selectedTheme.name}</h2>
                    {selectedThemeMedia?.image ? (
                      <AtlasContextPhoto
                        src={selectedThemeImage}
                        fallbackSrc=""
                        alt={selectedThemeMedia.alt || `${selectedTheme.name} photo`}
                      />
                    ) : null}
                    {isAllThematicsOverview ? (
                      <>
                        <p>{globalContent.about?.mission || selectedTheme.description}</p>
                        {globalContent.about?.vision ? <p><strong>Vision:</strong> {globalContent.about.vision}</p> : null}
                        {allThematicsScopeBullets.length ? (
                          <section className="atlas-context-evidence" aria-label="Tenure Facility 2024 scope">
                            <h3>Scope in 2024</h3>
                            <ul>
                              {allThematicsScopeBullets.map((bullet) => (
                                <li key={bullet}>{bullet}</li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                        {allThematicsPillarsLabel ? <p><strong>Approach:</strong> {allThematicsPillarsLabel}</p> : null}
                      </>
                    ) : (
                      <>
                        <p>{selectedTheme.description}</p>
                        <ul>
                          {selectedTheme.related_stories.slice(0, 4).map((story) => (
                            <li key={story}>{story}</li>
                          ))}
                        </ul>
                        <blockquote className="atlas-context-quote">
                          <p>"{editorialQuote.text}"</p>
                          <footer>{editorialQuote.attribution}</footer>
                        </blockquote>
                      </>
                    )}
                  </>
                )}
              </aside>
            </div>
          }
        />
      </section>
    </div>
  );
}
