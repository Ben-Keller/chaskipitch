import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalMapD3 } from "./global-map-d3";
import { KpiStrip } from "./kpi-strip";
import { LoadingPanel, ErrorPanel } from "./loading-panel";
import { usePageColorControls } from "../lib/page-color-controls";
import { ColorControlOverlay } from "./color-control-overlay";
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
import { formatCompact, formatUnit } from "../lib/format";
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

function normalizeHighlightText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\W_]+/g, " ")
    .trim();
}

function titleFromSlug(slug) {
  return String(slug ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const REGION_BUBBLE_COLORS = {
  global: "#d4b988",
  africa: "#d05c49",
  asia: "#0b4f63",
  latin_america: "#128c7e"
};

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
  const [loadingLabel, setLoadingLabel] = useState("Loading 10 years of progress");
  const {
    categories,
    selectedThemes,
    styleVars,
    applyThemeCategory,
    resetScope,
    saveControlJson
  } = usePageColorControls("impact");

  const [selectedThemeSlug, setSelectedThemeSlug] = useState("tenure-security");
  const [selectedRegion, setSelectedRegion] = useState("global");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountryIso, setSelectedCountryIso] = useState(null);
  const [selectedStatusId, setSelectedStatusId] = useState(null);
  const [hoveredCountryIso, setHoveredCountryIso] = useState(null);
  const [hoveredThemeSlug, setHoveredThemeSlug] = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [hoveredStatusId, setHoveredStatusId] = useState(null);
  const [selectedTerritoryGeo, setSelectedTerritoryGeo] = useState(fallbackGeoCollection);
  const [selectedCountryEvidence, setSelectedCountryEvidence] = useState(fallbackCountryEvidence);
  const [hoveredCountryEvidence, setHoveredCountryEvidence] = useState(fallbackCountryEvidence);
  const [hoveredCountryEvidenceIso, setHoveredCountryEvidenceIso] = useState("");
  const countryEvidenceCacheRef = useRef(new Map());
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

  const countriesByIso = useMemo(
    () => new Map(countries.map((country) => [country.iso3, country])),
    [countries]
  );
  const themesBySlug = useMemo(
    () => new Map(themes.map((theme) => [theme.slug, theme])),
    [themes]
  );
  const statusDefinitionById = useMemo(
    () =>
      new Map(
        (globalContent.status_definitions ?? [])
          .filter((status) => status?.id)
          .map((status) => [status.id, status])
      ),
    [globalContent.status_definitions]
  );
  const isoByStatusId = useMemo(() => {
    const map = new Map();
    countries.forEach((country) => {
      const statusId = String(country.status ?? "").trim();
      if (!statusId) {
        return;
      }
      if (!map.has(statusId)) {
        map.set(statusId, new Set());
      }
      map.get(statusId).add(country.iso3);
    });
    return map;
  }, [countries]);
  const isoByThemeSlug = useMemo(() => {
    const map = new Map();
    themes.forEach((theme) => map.set(theme.slug, new Set()));
    countries.forEach((country) => {
      (country.thematics ?? []).forEach((slug) => {
        if (!map.has(slug)) {
          map.set(slug, new Set());
        }
        map.get(slug).add(country.iso3);
      });
    });
    return map;
  }, [countries, themes]);
  const isoByRegionKey = useMemo(() => {
    const map = new Map();
    map.set("global", new Set(countries.map((country) => country.iso3)));
    countries.forEach((country) => {
      const key = String(country.region ?? "").trim();
      if (!key) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, new Set());
      }
      map.get(key).add(country.iso3);
    });
    return map;
  }, [countries]);

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

  const clearHoverState = useCallback(() => {
    setHoveredCountryIso(null);
    setHoveredThemeSlug(null);
    setHoveredRegion(null);
    setHoveredStatusId(null);
  }, []);

  const handleCountrySelect = useCallback((iso3) => {
    setSelectedStatusId(null);
    setSelectedCountryIso(iso3);
    setHoveredCountryIso(null);
    setHoveredStatusId(null);
  }, []);

  const handleThemeSelect = useCallback((slug) => {
    setSelectedStatusId(null);
    setSelectedThemeSlug(slug);
    setHoveredThemeSlug(null);
    setHoveredStatusId(null);
  }, []);

  const handleRegionSelect = useCallback((regionKey) => {
    setSelectedStatusId(null);
    setSelectedRegion(regionKey);
    setSelectedCountryIso(null);
    setHoveredRegion(null);
    setHoveredStatusId(null);
  }, []);

  const handleStatusSelect = useCallback((statusId) => {
    setSelectedStatusId((current) => (current === statusId ? null : statusId));
    setSelectedCountryIso(null);
    clearHoverState();
  }, [clearHoverState]);

  useEffect(() => {
    if (!loading) {
      return;
    }
    setLoadingLabel("Loading 10 years of progress");
    const timerId = window.setTimeout(() => {
      setLoadingLabel("Analyzing global impact");
    }, 2600);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [loading]);

  useEffect(() => {
    const handleWindowBlur = () => {
      clearHoverState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearHoverState();
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearHoverState]);

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

  const selectedCountry = selectedCountryIso
    ? countriesByIso.get(selectedCountryIso) ?? null
    : null;
  const hoveredCountry = hoveredCountryIso
    ? countriesByIso.get(hoveredCountryIso) ?? null
    : null;
  const hoveredTheme = hoveredThemeSlug
    ? themesBySlug.get(hoveredThemeSlug) ?? null
    : null;
  const hoveredStatusDefinition = hoveredStatusId
    ? statusDefinitionById.get(hoveredStatusId) ?? null
    : null;
  const selectedStatusDefinition = selectedStatusId
    ? statusDefinitionById.get(selectedStatusId) ?? null
    : null;

  const contextMode = useMemo(() => {
    if (hoveredCountry) return "country";
    if (hoveredStatusDefinition) return "status";
    if (hoveredTheme) return "theme";
    if (hoveredRegion) return "region";
    if (selectedStatusDefinition) return "status";
    if (selectedCountry) return "country";
    if (selectedRegion !== "global") return "region";
    return "theme";
  }, [
    hoveredCountry,
    hoveredRegion,
    hoveredStatusDefinition,
    hoveredTheme,
    selectedCountry,
    selectedRegion,
    selectedStatusDefinition
  ]);

  const contextCountry = contextMode === "country" ? hoveredCountry ?? selectedCountry : null;
  const contextTheme = contextMode === "theme" ? hoveredTheme ?? selectedTheme : selectedTheme;
  const contextRegionKey = contextMode === "region" ? hoveredRegion ?? selectedRegion : null;
  const contextStatus = contextMode === "status" ? hoveredStatusDefinition ?? selectedStatusDefinition : null;
  const isContextPreviewMode = Boolean(
    (hoveredCountry && hoveredCountry.iso3 !== selectedCountryIso) ||
      (hoveredStatusDefinition && hoveredStatusDefinition.id !== selectedStatusId) ||
      (hoveredTheme && hoveredTheme.slug !== selectedThemeSlug) ||
      (hoveredRegion && hoveredRegion !== selectedRegion)
  );

  const selectedCountryThemes = useMemo(
    () => new Set((hoveredCountry ?? selectedCountry)?.thematics ?? []),
    [hoveredCountry, selectedCountry]
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

    const cached = countryEvidenceCacheRef.current.get(selectedCountryIso);
    if (cached) {
      setSelectedCountryEvidence(cached);
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
        const nextEvidence = payload ?? fallbackCountryEvidence;
        countryEvidenceCacheRef.current.set(selectedCountryIso, nextEvidence);
        setSelectedCountryEvidence(nextEvidence);
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

  useEffect(() => {
    let active = true;
    const hoverIso = hoveredCountry?.iso3 ?? null;

    if (!hoverIso || hoverIso === selectedCountryIso) {
      setHoveredCountryEvidenceIso("");
      setHoveredCountryEvidence(fallbackCountryEvidence);
      return () => {
        active = false;
      };
    }

    const cached = countryEvidenceCacheRef.current.get(hoverIso);
    if (cached) {
      setHoveredCountryEvidenceIso(hoverIso);
      setHoveredCountryEvidence(cached);
      return () => {
        active = false;
      };
    }

    setHoveredCountryEvidenceIso("");
    setHoveredCountryEvidence(fallbackCountryEvidence);

    getCountryEvidenceByIso(hoverIso)
      .then((payload) => {
        if (!active) {
          return;
        }
        const nextEvidence = payload ?? fallbackCountryEvidence;
        countryEvidenceCacheRef.current.set(hoverIso, nextEvidence);
        setHoveredCountryEvidenceIso(hoverIso);
        setHoveredCountryEvidence(nextEvidence);
      })
      .catch(() => {
        if (active) {
          setHoveredCountryEvidenceIso(hoverIso);
          setHoveredCountryEvidence(fallbackCountryEvidence);
        }
      });

    return () => {
      active = false;
    };
  }, [hoveredCountry?.iso3, selectedCountryIso]);

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

  const countryPhotoPoolByIso = useMemo(() => {
    const entries = Object.entries(photoAssignments?.country_photo_pool ?? {}).map(([iso3, mediaPool]) => [
      String(iso3).trim().toUpperCase(),
      Array.isArray(mediaPool) ? mediaPool : []
    ]);
    return new Map(entries);
  }, [photoAssignments?.country_photo_pool]);

  const selectedThemeTextureBySlug = useMemo(() => {
    const entries = Object.entries(photoAssignments?.theme_media ?? {}).map(([slug, media]) => [
      slug,
      resolveMediaPath(media?.texture)
    ]);
    return new Map(entries);
  }, [photoAssignments?.theme_media]);

  const contextThemeMedia = photoAssignments?.theme_media?.[contextTheme.slug] ?? null;
  const contextThemeImage = resolveMediaPath(contextThemeMedia?.image);
  const contextCountryPhoto = contextCountry?.iso3
    ? countryPhotoByIso.get(String(contextCountry.iso3).toUpperCase()) ?? null
    : null;
  const contextCountryPhotoFallback = useMemo(() => {
    if (!contextCountry || contextCountryPhoto || !countryPhotoPool.length) {
      return null;
    }
    const hash = [...String(contextCountry.iso3)]
      .map((char) => char.charCodeAt(0))
      .reduce((sum, code) => sum + code, 0);
    return countryPhotoPool[hash % countryPhotoPool.length] ?? null;
  }, [contextCountry, contextCountryPhoto, countryPhotoPool]);
  const contextCountryContextMedia =
    contextCountryPhoto ?? contextCountryPhotoFallback ?? contextThemeMedia ?? null;

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
    : displayedKpis;

  const selectedLegendHighlightIso = useMemo(
    () => (selectedStatusId ? [...(isoByStatusId.get(selectedStatusId) ?? new Set())] : []),
    [isoByStatusId, selectedStatusId]
  );

  const hoveredHighlightIso = useMemo(() => {
    if (hoveredCountryIso) {
      return [hoveredCountryIso];
    }
    if (hoveredStatusId) {
      return [...(isoByStatusId.get(hoveredStatusId) ?? new Set())];
    }
    if (hoveredThemeSlug) {
      return [...(isoByThemeSlug.get(hoveredThemeSlug) ?? new Set())];
    }
    if (hoveredRegion) {
      return [...(isoByRegionKey.get(hoveredRegion) ?? new Set())];
    }
    return [];
  }, [hoveredCountryIso, hoveredRegion, hoveredStatusId, hoveredThemeSlug, isoByRegionKey, isoByStatusId, isoByThemeSlug]);

  const contextCountryFeaturedAchievements = useMemo(() => {
    const seen = new Set();
    return (contextCountry?.featured_achievements ?? []).filter((achievement) => {
      const key = normalizeHighlightText(achievement);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [contextCountry]);

  const contextCountryEvidence = useMemo(() => {
    if (!contextCountry?.iso3) {
      return fallbackCountryEvidence;
    }
    if (contextCountry.iso3 === selectedCountryIso) {
      return selectedCountryEvidence;
    }
    if (contextCountry.iso3 === hoveredCountryEvidenceIso) {
      return hoveredCountryEvidence;
    }
    return countryEvidenceCacheRef.current.get(contextCountry.iso3) ?? fallbackCountryEvidence;
  }, [
    contextCountry,
    hoveredCountryEvidence,
    hoveredCountryEvidenceIso,
    selectedCountryEvidence,
    selectedCountryIso
  ]);

  const contextCountryEvidenceHighlights = useMemo(() => {
    const seen = new Set(
      contextCountryFeaturedAchievements.map((achievement) => normalizeHighlightText(achievement))
    );
    return buildEvidenceHighlights(contextCountryEvidence).filter((highlight) => {
      const key = normalizeHighlightText(highlight?.text);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [contextCountryEvidence, contextCountryFeaturedAchievements]);

  const contextCountryEvidenceExcerpts = useMemo(() => {
    const seen = new Set([
      ...contextCountryFeaturedAchievements.map((achievement) => normalizeHighlightText(achievement)),
      ...contextCountryEvidenceHighlights.map((highlight) => normalizeHighlightText(highlight?.text))
    ]);
    return buildEvidenceExcerpts(contextCountryEvidence).filter((excerpt) => {
      const combined = normalizeHighlightText(`${excerpt?.title ?? ""} ${excerpt?.description ?? ""}`);
      const titleOnly = normalizeHighlightText(excerpt?.title);
      const descriptionOnly = normalizeHighlightText(excerpt?.description);
      const isDuplicate =
        (combined && seen.has(combined)) ||
        (titleOnly && seen.has(titleOnly)) ||
        (descriptionOnly && seen.has(descriptionOnly));
      if (isDuplicate || (!combined && !titleOnly && !descriptionOnly)) {
        return false;
      }
      if (combined) seen.add(combined);
      if (titleOnly) seen.add(titleOnly);
      if (descriptionOnly) seen.add(descriptionOnly);
      return true;
    });
  }, [contextCountryEvidence, contextCountryEvidenceHighlights, contextCountryFeaturedAchievements]);

  const contextCountryVideos = useMemo(() => {
    if (!contextCountry) {
      return [];
    }
    return buildCountryVideos(contextCountry, countryVideoIndex);
  }, [contextCountry, countryVideoIndex]);

  const contextEditorialQuote = quotes.find((quote) => quote.theme === contextTheme.slug) ??
    quotes[0] ?? {
      text: "Tenure is a fundamental right that benefits people and planet.",
      attribution: "Tenure Facility",
      source_page: 18
    };

  const contextStatusCountries = useMemo(() => {
    if (!contextStatus?.id) {
      return [];
    }
    return countries
      .filter((country) => country.status === contextStatus.id)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [contextStatus?.id, countries]);

  const contextRegionCountries = useMemo(() => {
    if (!contextRegionKey || contextRegionKey === "global") {
      return [];
    }
    return countries
      .filter((country) => country.region === contextRegionKey)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [contextRegionKey, countries]);

  const contextRegionOption = useMemo(
    () => regionOptions.find((option) => option.key === contextRegionKey) ?? null,
    [contextRegionKey]
  );

  const contextThemeTitle = contextTheme.slug === "tenure-security" ? "Global Portfolio" : contextTheme.name;

  const contextRegionSnapshot = useMemo(() => {
    if (!contextRegionKey || contextRegionKey === "global") {
      return null;
    }
    const projectCount = contextRegionCountries.reduce(
      (sum, country) => sum + (Number(country.project_count) || 0),
      0
    );
    const rawHectares = Number(globalContent.regional_kpis?.[contextRegionKey]?.hectares_positively_impacted);
    const hectares = Number.isFinite(rawHectares) && rawHectares > 0 ? rawHectares : null;
    const regionalNote = String(globalContent.regional_kpis?.[contextRegionKey]?.note ?? "").trim();
    return {
      countries: contextRegionCountries.length,
      projects: projectCount,
      hectares,
      regionalNote
    };
  }, [contextRegionCountries, contextRegionKey, globalContent.regional_kpis]);

  const contextRegionThemeCoverage = useMemo(() => {
    if (!contextRegionCountries.length) {
      return [];
    }

    const counts = new Map();
    contextRegionCountries.forEach((country) => {
      (country.thematics ?? []).forEach((slug) => {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      });
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([slug, count]) => ({
        slug,
        name: themesBySlug.get(slug)?.name ?? titleFromSlug(slug),
        count
      }));
  }, [contextRegionCountries, themesBySlug]);

  const contextRegionHighlights = useMemo(() => {
    if (!contextRegionCountries.length) {
      return [];
    }

    const rankedCountries = [...contextRegionCountries].sort(
      (left, right) =>
        (Number(right.project_count) || 0) - (Number(left.project_count) || 0) ||
        left.name.localeCompare(right.name)
    );

    const seen = new Set();
    const highlights = [];
    for (const country of rankedCountries) {
      for (const achievement of country.featured_achievements ?? []) {
        const normalized = normalizeHighlightText(achievement);
        if (!normalized || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        highlights.push(`${country.name}: ${achievement}`);
        if (highlights.length >= 4) {
          return highlights;
        }
      }
    }
    return highlights;
  }, [contextRegionCountries]);

  const contextRegionContextMedia = useMemo(() => {
    if (!contextRegionCountries.length) {
      return null;
    }

    const rankedCountries = [...contextRegionCountries].sort(
      (left, right) =>
        (Number(right.project_count) || 0) - (Number(left.project_count) || 0) ||
        left.name.localeCompare(right.name)
    );

    for (const country of rankedCountries) {
      const iso = String(country.iso3 ?? "").toUpperCase();
      const primary = countryPhotoByIso.get(iso);
      const pool = countryPhotoPoolByIso.get(iso) ?? [];
      const extra = pool.find(
        (candidate) =>
          typeof candidate?.image === "string" &&
          candidate.image.length > 0 &&
          candidate.image !== primary?.image
      );
      if (extra) {
        return {
          image: extra.image,
          alt: `Regional context photo from ${country.name}`,
          y_offset: extra.y_offset
        };
      }
    }

    for (const country of rankedCountries) {
      const primary = countryPhotoByIso.get(String(country.iso3 ?? "").toUpperCase());
      if (primary?.image) {
        return {
          ...primary,
          alt: primary.alt || `Regional context photo from ${country.name}`
        };
      }
    }

    return null;
  }, [contextRegionCountries, countryPhotoByIso, countryPhotoPoolByIso]);

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

  const regionalHectareBubbles = useMemo(() => {
    const regionalKpis = globalContent.regional_kpis ?? {};
    const values = regionOptions.map((option) => {
      const rawValue = Number(regionalKpis?.[option.key]?.hectares_positively_impacted);
      return {
        key: option.key,
        hectares: Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null
      };
    });

    const maxHectares = Math.max(
      ...values.map((entry) => (Number.isFinite(entry.hectares) ? entry.hectares : 0)),
      1
    );

    return values.map((entry) => {
      const scaledRatio = entry.hectares ? Math.sqrt(entry.hectares / maxHectares) : 0;
      return {
        ...entry,
        bubbleSize: entry.hectares ? 8 + scaledRatio * 14 : 8,
        color: REGION_BUBBLE_COLORS[entry.key] ?? "#d4b988"
      };
    });
  }, [globalContent.regional_kpis]);

  const regionalHectareBubbleByKey = useMemo(
    () => new Map(regionalHectareBubbles.map((entry) => [entry.key, entry])),
    [regionalHectareBubbles]
  );

  const isAllThematicsOverview = !selectedCountry && selectedTheme.slug === "tenure-security";

  useEffect(() => {
    if (contextCardRef.current) {
      contextCardRef.current.scrollTop = 0;
    }
  }, [selectedCountryIso, selectedThemeSlug, selectedStatusId, selectedRegion]);

  if (loading) {
    return <LoadingPanel label={loadingLabel} />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load impact workspace data." />;
  }

  return (
    <div className="impact-atlas-shell" style={styleVars}>
      <section className="impact-atlas-stage" aria-label="Interactive global footprint atlas">
        <GlobalMapD3
          allCountries={countries}
          visibleCountries={visibleCountries}
          selectedRegion={selectedRegion}
          isAllThematicsOverview={isAllThematicsOverview}
          worldFootprintGeo={worldGeo}
          worldCountriesGeo={worldCountriesGeo}
          statusDefinitions={globalContent.status_definitions}
          selectedIso={selectedCountry?.iso3 ?? null}
          selectedHighlightIso={selectedLegendHighlightIso}
          hoveredHighlightIso={hoveredHighlightIso}
          selectedStatusId={selectedStatusId}
          hoveredStatusId={hoveredStatusId}
          hoveredIso={hoveredCountryIso}
          selectedTerritoryGeo={selectedTerritoryGeo}
          onCountrySelect={handleCountrySelect}
          onCountryHover={setHoveredCountryIso}
          onStatusSelect={handleStatusSelect}
          onStatusHover={setHoveredStatusId}
          onClearSelection={() => {
            setSelectedCountryIso(null);
            setSelectedRegion("global");
            setSelectedThemeSlug("tenure-security");
            setSelectedStatusId(null);
            clearHoverState();
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
                        {regionOptions.map((option) => {
                          const regionalBubble = regionalHectareBubbleByKey.get(option.key);
                          const hasHectares = Number.isFinite(regionalBubble?.hectares);
                          const tooltipId = `atlas-region-hectares-${option.key}`;
                          const tooltipText = hasHectares
                            ? `${formatUnit(regionalBubble.hectares, "ha")} positively impacted`
                            : "";
                          return (
                            <button
                              key={option.key}
                              type="button"
                              className={[
                                "atlas-region-tab",
                                selectedRegion === option.key ? "is-active" : "",
                                hoveredRegion === option.key ? "is-hovered" : ""
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-describedby={hasHectares ? tooltipId : undefined}
                              title={tooltipText || undefined}
                              onMouseEnter={() => setHoveredRegion(option.key)}
                              onMouseLeave={() => setHoveredRegion(null)}
                              onClick={() => handleRegionSelect(option.key)}
                            >
                              <span className="atlas-region-tab__label">{option.label}</span>
                              {hasHectares ? (
                                <span className="atlas-region-tab__meta">
                                  <span
                                    className="atlas-region-tab__bubble"
                                    aria-hidden="true"
                                    style={{
                                      "--bubble-size": `${regionalBubble.bubbleSize}px`,
                                      "--bubble-color": regionalBubble.color
                                    }}
                                  />
                                  <span className="atlas-region-tab__value">
                                    {`${formatCompact(regionalBubble.hectares)} ha`}
                                  </span>
                                </span>
                              ) : null}
                              {hasHectares ? (
                                <span id={tooltipId} className="atlas-region-bubble-tooltip" role="tooltip">
                                  {tooltipText}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
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
                          hoveredThemeSlug === theme.slug ? "is-hovered" : "",
                          selectedCountryThemes.has(theme.slug) ? "is-country-theme" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onMouseEnter={() => setHoveredThemeSlug(theme.slug)}
                        onMouseLeave={() => setHoveredThemeSlug(null)}
                        onClick={() => handleThemeSelect(theme.slug)}
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

              <aside
                ref={contextCardRef}
                className={`atlas-context-card${isContextPreviewMode ? " atlas-context-card--preview" : ""}`}
                aria-label="Theme and country context"
              >
                {contextMode === "country" && contextCountry ? (
                  <>
                    <h2>{contextCountry.name}</h2>
                    {contextCountryContextMedia?.image ? (
                      <AtlasContextPhoto
                        src={resolveMediaPath(contextCountryContextMedia?.image)}
                        fallbackSrc={contextThemeImage || ""}
                        alt={
                          contextCountryContextMedia?.alt || `${contextCountry.name} photo`
                        }
                        yOffset={contextCountryContextMedia?.y_offset}
                      />
                    ) : null}
                    <p>{contextCountry.summary}</p>
                    {contextCountryFeaturedAchievements.length ? (
                      <ul>
                        {contextCountryFeaturedAchievements.slice(0, 3).map((achievement) => (
                          <li key={achievement}>{achievement}</li>
                        ))}
                      </ul>
                    ) : null}
                    {contextCountryEvidenceHighlights.length ? (
                      <section className="atlas-context-evidence" aria-label={`${contextCountry.name} report highlights`}>
                        <h3>Additional highlights</h3>
                        <ul>
                          {contextCountryEvidenceHighlights.map((highlight) => (
                            <li key={highlight.id}>{highlight.text}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {contextCountryEvidence.organization_mentions?.length ? (
                      <p className="note">
                        Organizations mentioned: {contextCountryEvidence.organization_mentions.slice(0, 6).join(", ")}
                      </p>
                    ) : null}
                    {contextCountryVideos.length ? (
                      <section className="atlas-context-videos" aria-label={`${contextCountry.name} videos`}>
                        <h3>Country Videos</h3>
                        {contextCountryVideos.some((video) => video.isFallback) ? (
                          <p className="note">No direct country-tagged video was found; showing latest Tenure Facility videos.</p>
                        ) : null}
                        <div className="atlas-context-videos__list">
                          {contextCountryVideos.map((video) => (
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
                    {contextCountryEvidenceExcerpts.length ? (
                      <section className="atlas-context-evidence" aria-label={`${contextCountry.name} report excerpts`}>
                        <h3>Report excerpts</h3>
                        <ul>
                          {contextCountryEvidenceExcerpts.map((excerpt) => (
                            <li key={excerpt.id}>
                              <strong>{excerpt.title}</strong> {excerpt.description}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </>
                ) : contextMode === "status" && contextStatus ? (
                  <>
                    <h2>{contextStatus.label}</h2>
                    <p>{contextStatus.description || "Status classification used to group countries in the 2024 portfolio."}</p>
                    <p className="note">{formatUnit(contextStatusCountries.length, "countries")} in this status.</p>
                    {contextStatusCountries.length ? (
                      <section className="atlas-context-evidence" aria-label={`${contextStatus.label} countries`}>
                        <h3>Countries</h3>
                        <ul>
                          {contextStatusCountries.slice(0, 12).map((country) => (
                            <li key={country.iso3}>{country.name}</li>
                          ))}
                        </ul>
                        {contextStatusCountries.length > 12 ? (
                          <p className="note">Showing 12 of {contextStatusCountries.length} countries.</p>
                        ) : null}
                      </section>
                    ) : null}
                  </>
                ) : contextMode === "region" && contextRegionOption ? (
                  <>
                    <h2>{contextRegionOption.label} Region</h2>
                    {contextRegionContextMedia?.image ? (
                      <AtlasContextPhoto
                        src={resolveMediaPath(contextRegionContextMedia.image)}
                        fallbackSrc={contextThemeImage || ""}
                        alt={contextRegionContextMedia.alt || `${contextRegionOption.label} region photo`}
                        yOffset={contextRegionContextMedia.y_offset}
                      />
                    ) : null}
                    {contextRegionSnapshot ? (
                      <p>
                        {contextRegionOption.label} includes {formatUnit(contextRegionSnapshot.countries, "countries")} with{" "}
                        {formatUnit(contextRegionSnapshot.projects, "projects")} in the 2024 portfolio.
                      </p>
                    ) : (
                      <p>Regional totals are shown where available in the report dataset.</p>
                    )}
                    {contextRegionSnapshot?.regionalNote ? (
                      <p className="note">{contextRegionSnapshot.regionalNote}</p>
                    ) : null}
                    {contextRegionSnapshot ? (
                      <section className="atlas-context-evidence" aria-label={`${contextRegionOption.label} regional snapshot`}>
                        <h3>Regional snapshot</h3>
                        <ul>
                          {contextRegionSnapshot.hectares ? (
                            <li>{formatUnit(contextRegionSnapshot.hectares, "ha")} positively impacted.</li>
                          ) : null}
                          <li>{formatUnit(contextRegionSnapshot.projects, "projects")} currently tracked.</li>
                          <li>{formatUnit(contextRegionThemeCoverage.length, "thematic focus areas")} represented.</li>
                        </ul>
                      </section>
                    ) : null}
                    {contextRegionThemeCoverage.length ? (
                      <section className="atlas-context-evidence" aria-label={`${contextRegionOption.label} thematics`}>
                        <h3>Thematics represented</h3>
                        <ul>
                          {contextRegionThemeCoverage.map((entry) => (
                            <li key={entry.slug}>
                              {entry.name}: {formatUnit(entry.count, "countries")}.
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {contextRegionHighlights.length ? (
                      <section className="atlas-context-evidence" aria-label={`${contextRegionOption.label} highlights`}>
                        <h3>Highlights</h3>
                        <ul>
                          {contextRegionHighlights.map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {contextRegionCountries.length ? (
                      <section className="atlas-context-evidence" aria-label={`${contextRegionOption.label} countries`}>
                        <h3>Countries</h3>
                        <ul>
                          {contextRegionCountries.slice(0, 12).map((country) => (
                            <li key={country.iso3}>{country.name}</li>
                          ))}
                        </ul>
                        {contextRegionCountries.length > 12 ? (
                          <p className="note">Showing 12 of {contextRegionCountries.length} countries.</p>
                        ) : null}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h2>{contextThemeTitle}</h2>
                    {contextThemeMedia?.image ? (
                      <AtlasContextPhoto
                        src={contextThemeImage}
                        fallbackSrc=""
                        alt={contextThemeMedia.alt || `${contextTheme.name} photo`}
                        yOffset={contextThemeMedia?.y_offset}
                      />
                    ) : null}
                    {contextTheme.slug === "tenure-security" ? (
                      <>
                        <p>{globalContent.about?.mission || contextTheme.description}</p>
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
                        <p>{contextTheme.description}</p>
                        <ul>
                          {(contextTheme.related_stories ?? []).slice(0, 4).map((story) => (
                            <li key={story}>{story}</li>
                          ))}
                        </ul>
                        <blockquote className="atlas-context-quote">
                          <p>"{contextEditorialQuote.text}"</p>
                          <footer>{contextEditorialQuote.attribution}</footer>
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
      <ColorControlOverlay
        scope="impact"
        categories={categories}
        selectedThemes={selectedThemes}
        onThemeChange={applyThemeCategory}
        onSave={saveControlJson}
        onReset={resetScope}
      />
    </div>
  );
}
