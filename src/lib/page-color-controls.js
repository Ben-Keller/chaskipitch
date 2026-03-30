import { useCallback, useEffect, useMemo, useState } from "react";
import defaultControls from "../config/page-color-controls.json";

const STORAGE_KEY = "chaski_page_color_controls_v1";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export const PAGE_COLOR_THEME_CATEGORIES = {
  home: [
    {
      id: "background",
      label: "Main Background",
      options: [
        {
          id: "teal-atmosphere",
          label: "Teal Atmosphere",
          tokens: {
            "home-page-bg-start": "#12333a",
            "home-page-bg-mid": "#1b4248",
            "home-page-bg-end": "#24363e"
          }
        },
        {
          id: "warm-earth",
          label: "Warm Earth",
          tokens: {
            "home-page-bg-start": "#37251f",
            "home-page-bg-mid": "#5f4034",
            "home-page-bg-end": "#704d3f"
          }
        },
        {
          id: "slate-night",
          label: "Slate Night",
          tokens: {
            "home-page-bg-start": "#182230",
            "home-page-bg-mid": "#253548",
            "home-page-bg-end": "#33455c"
          }
        },
        {
          id: "desert-dusk",
          label: "Desert Dusk",
          tokens: {
            "home-page-bg-start": "#352117",
            "home-page-bg-mid": "#61422f",
            "home-page-bg-end": "#8f6550"
          }
        },
        {
          id: "rainforest-fog",
          label: "Rainforest Fog",
          tokens: {
            "home-page-bg-start": "#102723",
            "home-page-bg-mid": "#285048",
            "home-page-bg-end": "#4d7167"
          }
        },
        {
          id: "arctic-stone",
          label: "Arctic Stone",
          tokens: {
            "home-page-bg-start": "#1d2831",
            "home-page-bg-mid": "#344855",
            "home-page-bg-end": "#596f80"
          }
        }
      ]
    },
    {
      id: "hero",
      label: "Hero Theme",
      options: [
        {
          id: "teal-ember",
          label: "Teal Ember",
          tokens: {
            "home-hero-bg-start": "#0a2228",
            "home-hero-bg-mid": "#0f3138",
            "home-hero-bg-end": "#112d35",
            "home-hero-accent-warm": "#e1895c",
            "home-hero-accent-cool": "#4db5ad",
            "home-hero-kicker": "#a4e8dd",
            "home-hero-title": "#f6fffb",
            "home-hero-body": "#d5f0e9",
            "home-hero-rule": "#93ecdc",
            "home-button-bg": "#08282b",
            "home-button-text": "#f2fffb"
          }
        },
        {
          id: "deep-ocean",
          label: "Deep Ocean",
          tokens: {
            "home-hero-bg-start": "#071626",
            "home-hero-bg-mid": "#10273d",
            "home-hero-bg-end": "#12324b",
            "home-hero-accent-warm": "#d88958",
            "home-hero-accent-cool": "#4da6de",
            "home-hero-kicker": "#9ed2f6",
            "home-hero-title": "#f0f8ff",
            "home-hero-body": "#cde3f6",
            "home-hero-rule": "#81c4f2",
            "home-button-bg": "#0b1f36",
            "home-button-text": "#e4f2ff"
          }
        },
        {
          id: "forest-copper",
          label: "Forest Copper",
          tokens: {
            "home-hero-bg-start": "#102520",
            "home-hero-bg-mid": "#1b3a31",
            "home-hero-bg-end": "#23463b",
            "home-hero-accent-warm": "#d17b4a",
            "home-hero-accent-cool": "#63b08f",
            "home-hero-kicker": "#9fe0c6",
            "home-hero-title": "#f4fcf8",
            "home-hero-body": "#d6efe6",
            "home-hero-rule": "#8fd5bd",
            "home-button-bg": "#15342d",
            "home-button-text": "#ebf8f3"
          }
        },
        {
          id: "sunrise-clay",
          label: "Sunrise Clay",
          tokens: {
            "home-hero-bg-start": "#3a2118",
            "home-hero-bg-mid": "#6a3b2a",
            "home-hero-bg-end": "#8d5540",
            "home-hero-accent-warm": "#f2a56f",
            "home-hero-accent-cool": "#f0bf8c",
            "home-hero-kicker": "#ffd6b2",
            "home-hero-title": "#fff4ea",
            "home-hero-body": "#f6ddca",
            "home-hero-rule": "#ffc89c",
            "home-button-bg": "#5e2f20",
            "home-button-text": "#fff1e5"
          }
        },
        {
          id: "aurora-teal",
          label: "Aurora Teal",
          tokens: {
            "home-hero-bg-start": "#082220",
            "home-hero-bg-mid": "#0e3c3a",
            "home-hero-bg-end": "#155b55",
            "home-hero-accent-warm": "#78d0b8",
            "home-hero-accent-cool": "#49d3cf",
            "home-hero-kicker": "#a9f0ea",
            "home-hero-title": "#eafffb",
            "home-hero-body": "#c8efe9",
            "home-hero-rule": "#7ce4da",
            "home-button-bg": "#0c3532",
            "home-button-text": "#dcfffa"
          }
        },
        {
          id: "noir-gold",
          label: "Noir Gold",
          tokens: {
            "home-hero-bg-start": "#111111",
            "home-hero-bg-mid": "#1d1a16",
            "home-hero-bg-end": "#2b241b",
            "home-hero-accent-warm": "#d8a05f",
            "home-hero-accent-cool": "#a7bca8",
            "home-hero-kicker": "#e0c18d",
            "home-hero-title": "#fff8eb",
            "home-hero-body": "#e8d8be",
            "home-hero-rule": "#d8ae73",
            "home-button-bg": "#2c1f14",
            "home-button-text": "#fff2dc"
          }
        }
      ]
    },
    {
      id: "cards",
      label: "Card Theme",
      options: [
        {
          id: "dark-glass",
          label: "Dark Glass",
          tokens: {
            "home-card-bg-start": "#0c2227",
            "home-card-bg-end": "#0e282e",
            "home-card-border": "#548084",
            "home-card-status": "#a3e2d7",
            "home-card-title": "#f5fffb",
            "home-card-body": "#d0e8e4"
          }
        },
        {
          id: "slate-ink",
          label: "Slate Ink",
          tokens: {
            "home-card-bg-start": "#1a2431",
            "home-card-bg-end": "#202d3b",
            "home-card-border": "#6e87a6",
            "home-card-status": "#b8d4ee",
            "home-card-title": "#f3f8ff",
            "home-card-body": "#d4e0ef"
          }
        },
        {
          id: "sandstone",
          label: "Sandstone",
          tokens: {
            "home-card-bg-start": "#3b3026",
            "home-card-bg-end": "#4a3d31",
            "home-card-border": "#b38d6d",
            "home-card-status": "#eec9a2",
            "home-card-title": "#fff4ea",
            "home-card-body": "#f0ddcb"
          }
        },
        {
          id: "mist-glass",
          label: "Mist Glass",
          tokens: {
            "home-card-bg-start": "#2b353d",
            "home-card-bg-end": "#36454e",
            "home-card-border": "#8ea3b2",
            "home-card-status": "#c8d7e3",
            "home-card-title": "#f6fbff",
            "home-card-body": "#dbe6ee"
          }
        },
        {
          id: "deep-forest",
          label: "Deep Forest",
          tokens: {
            "home-card-bg-start": "#132723",
            "home-card-bg-end": "#193731",
            "home-card-border": "#5b8d82",
            "home-card-status": "#9ed0c4",
            "home-card-title": "#edfff9",
            "home-card-body": "#cde9df"
          }
        },
        {
          id: "charcoal-contrast",
          label: "Charcoal Contrast",
          tokens: {
            "home-card-bg-start": "#1a1b1f",
            "home-card-bg-end": "#252730",
            "home-card-border": "#7a8091",
            "home-card-status": "#c2c8d8",
            "home-card-title": "#fbfcff",
            "home-card-body": "#dde1ee"
          }
        }
      ]
    }
  ],
  impact: [
    {
      id: "header",
      label: "Header Overlay",
      options: [
        {
          id: "ocean-atlas",
          label: "Ocean Atlas",
          tokens: {
            "impact-intro-bg-start": "#0a4e62",
            "impact-intro-bg-end": "#063c4b",
            "impact-intro-border": "#9cc6d4",
            "impact-intro-kicker": "#f6b7a0",
            "impact-intro-text": "#f5efe2",
            "impact-kpi-bg-start": "#f6f1e8",
            "impact-kpi-bg-end": "#e4efe9",
            "impact-kpi-text": "#143a34"
          }
        },
        {
          id: "forest-canopy",
          label: "Forest Canopy",
          tokens: {
            "impact-intro-bg-start": "#1b5f4d",
            "impact-intro-bg-end": "#17453a",
            "impact-intro-border": "#95cab4",
            "impact-intro-kicker": "#ffcb93",
            "impact-intro-text": "#edf8f1",
            "impact-kpi-bg-start": "#eaf5ee",
            "impact-kpi-bg-end": "#d8e9df",
            "impact-kpi-text": "#193c31"
          }
        },
        {
          id: "copper-earth",
          label: "Copper Earth",
          tokens: {
            "impact-intro-bg-start": "#8b4b34",
            "impact-intro-bg-end": "#5b3123",
            "impact-intro-border": "#e0b69f",
            "impact-intro-kicker": "#ffd2aa",
            "impact-intro-text": "#fff3e8",
            "impact-kpi-bg-start": "#f7e7dc",
            "impact-kpi-bg-end": "#efd8ca",
            "impact-kpi-text": "#4a2b1f"
          }
        },
        {
          id: "slate-ice",
          label: "Slate Ice",
          tokens: {
            "impact-intro-bg-start": "#364959",
            "impact-intro-bg-end": "#263643",
            "impact-intro-border": "#b9c9d8",
            "impact-intro-kicker": "#f0c9b5",
            "impact-intro-text": "#f3f8fc",
            "impact-kpi-bg-start": "#eef4fa",
            "impact-kpi-bg-end": "#dee9f3",
            "impact-kpi-text": "#223b4a"
          }
        }
      ]
    },
    {
      id: "filters",
      label: "Filters & Search",
      options: [
        {
          id: "deep-teal",
          label: "Deep Teal",
          tokens: {
            "impact-filter-bg": "#133731",
            "impact-filter-border": "#e4d5bd",
            "impact-filter-text": "#f6ecd8",
            "impact-filter-active-bg": "#f3e6cd",
            "impact-filter-active-border": "#f9efd6",
            "impact-input-bg": "#12322e",
            "impact-input-border": "#e4d5bd",
            "impact-input-text": "#f7edd8"
          }
        },
        {
          id: "midnight-blue",
          label: "Midnight Blue",
          tokens: {
            "impact-filter-bg": "#182f45",
            "impact-filter-border": "#b7cce3",
            "impact-filter-text": "#edf5ff",
            "impact-filter-active-bg": "#dcecff",
            "impact-filter-active-border": "#f1f7ff",
            "impact-input-bg": "#1c3a57",
            "impact-input-border": "#adc8e2",
            "impact-input-text": "#eef6ff"
          }
        },
        {
          id: "evergreen",
          label: "Evergreen",
          tokens: {
            "impact-filter-bg": "#1d4337",
            "impact-filter-border": "#b5d6c6",
            "impact-filter-text": "#eef8f2",
            "impact-filter-active-bg": "#dff2e7",
            "impact-filter-active-border": "#f1faf4",
            "impact-input-bg": "#245246",
            "impact-input-border": "#a8ceb9",
            "impact-input-text": "#eef8f2"
          }
        },
        {
          id: "burnt-sienna",
          label: "Burnt Sienna",
          tokens: {
            "impact-filter-bg": "#5a3328",
            "impact-filter-border": "#e3bfaa",
            "impact-filter-text": "#fdf0e6",
            "impact-filter-active-bg": "#f8e0cf",
            "impact-filter-active-border": "#fbeade",
            "impact-input-bg": "#643d30",
            "impact-input-border": "#e2bba4",
            "impact-input-text": "#fff1e7"
          }
        }
      ]
    },
    {
      id: "context",
      label: "Context Panel",
      options: [
        {
          id: "dark-glass",
          label: "Dark Glass",
          tokens: {
            "impact-context-bg": "#14362f",
            "impact-context-border": "#e4d5bd",
            "impact-context-preview-bg": "#1e3d36",
            "impact-context-title": "#ffffff",
            "impact-context-body": "#ffffff"
          }
        },
        {
          id: "ink-blue",
          label: "Ink Blue",
          tokens: {
            "impact-context-bg": "#1b2f44",
            "impact-context-border": "#b4cbe2",
            "impact-context-preview-bg": "#273c54",
            "impact-context-title": "#f6fbff",
            "impact-context-body": "#eef5ff"
          }
        },
        {
          id: "forest-paper",
          label: "Forest Paper",
          tokens: {
            "impact-context-bg": "#214438",
            "impact-context-border": "#b9d8c9",
            "impact-context-preview-bg": "#2b5546",
            "impact-context-title": "#f4fbf7",
            "impact-context-body": "#eef8f3"
          }
        },
        {
          id: "warm-clay",
          label: "Warm Clay",
          tokens: {
            "impact-context-bg": "#5a3529",
            "impact-context-border": "#e0bea8",
            "impact-context-preview-bg": "#714233",
            "impact-context-title": "#fff5ed",
            "impact-context-body": "#ffefe5"
          }
        }
      ]
    }
  ],
  films: [
    {
      id: "base",
      label: "Base Theme",
      options: [
        {
          id: "blue-charcoal",
          label: "Blue Charcoal",
          tokens: {
            "films-hero-bg-start": "#101a22",
            "films-hero-bg-end": "#0d151e",
            "films-hero-border": "#7a91b0",
            "films-hero-kicker": "#8ca8cf",
            "films-hero-title": "#f1f7ff",
            "films-hero-body": "#d1dff0",
            "films-panel-bg": "#0d121a",
            "films-panel-border": "#849cbc",
            "films-panel-border-active": "#9ab8df"
          }
        },
        {
          id: "graphite-steel",
          label: "Graphite Steel",
          tokens: {
            "films-hero-bg-start": "#16181f",
            "films-hero-bg-end": "#1f232d",
            "films-hero-border": "#8d95aa",
            "films-hero-kicker": "#b2bdd8",
            "films-hero-title": "#f3f6ff",
            "films-hero-body": "#d8deef",
            "films-panel-bg": "#12151c",
            "films-panel-border": "#8b95ac",
            "films-panel-border-active": "#b8c4dd"
          }
        },
        {
          id: "night-copper",
          label: "Night Copper",
          tokens: {
            "films-hero-bg-start": "#1b1513",
            "films-hero-bg-end": "#241d1b",
            "films-hero-border": "#a38978",
            "films-hero-kicker": "#d9beaa",
            "films-hero-title": "#fff4ee",
            "films-hero-body": "#f1ddd0",
            "films-panel-bg": "#181210",
            "films-panel-border": "#b19380",
            "films-panel-border-active": "#d2b09a"
          }
        },
        {
          id: "teal-nocturne",
          label: "Teal Nocturne",
          tokens: {
            "films-hero-bg-start": "#081b1d",
            "films-hero-bg-end": "#113338",
            "films-hero-border": "#68a8ac",
            "films-hero-kicker": "#89d2d7",
            "films-hero-title": "#e8feff",
            "films-hero-body": "#c2ecef",
            "films-panel-bg": "#0d2023",
            "films-panel-border": "#73b1b6",
            "films-panel-border-active": "#9dd9dd"
          }
        },
        {
          id: "obsidian-neon",
          label: "Obsidian Neon",
          tokens: {
            "films-hero-bg-start": "#0d0f18",
            "films-hero-bg-end": "#151a2b",
            "films-hero-border": "#6f8dd8",
            "films-hero-kicker": "#90aaf0",
            "films-hero-title": "#f2f6ff",
            "films-hero-body": "#cfd9f2",
            "films-panel-bg": "#0f1320",
            "films-panel-border": "#7e96d8",
            "films-panel-border-active": "#a7b8eb"
          }
        },
        {
          id: "stone-documentary",
          label: "Stone Documentary",
          tokens: {
            "films-hero-bg-start": "#1e1f22",
            "films-hero-bg-end": "#32353a",
            "films-hero-border": "#a4a9b2",
            "films-hero-kicker": "#d1d5de",
            "films-hero-title": "#f6f7fb",
            "films-hero-body": "#e2e5ec",
            "films-panel-bg": "#24262a",
            "films-panel-border": "#a5aab3",
            "films-panel-border-active": "#c6ccd6"
          }
        }
      ]
    },
    {
      id: "rail",
      label: "Title Rail",
      options: [
        {
          id: "ink",
          label: "Ink Rail",
          tokens: {
            "films-rail-bg-start": "#0a1018",
            "films-rail-bg-end": "#090d14",
            "films-rail-text": "#ecf4ff"
          }
        },
        {
          id: "midnight",
          label: "Midnight Rail",
          tokens: {
            "films-rail-bg-start": "#111a28",
            "films-rail-bg-end": "#0f1722",
            "films-rail-text": "#f1f6ff"
          }
        },
        {
          id: "warm-ink",
          label: "Warm Ink Rail",
          tokens: {
            "films-rail-bg-start": "#1d1411",
            "films-rail-bg-end": "#17100d",
            "films-rail-text": "#ffece2"
          }
        },
        {
          id: "oxidized-bronze",
          label: "Oxidized Bronze Rail",
          tokens: {
            "films-rail-bg-start": "#252018",
            "films-rail-bg-end": "#1d1812",
            "films-rail-text": "#f8dcb2"
          }
        },
        {
          id: "teal-glow",
          label: "Teal Glow Rail",
          tokens: {
            "films-rail-bg-start": "#0b211f",
            "films-rail-bg-end": "#0d1819",
            "films-rail-text": "#b7f7ee"
          }
        },
        {
          id: "silver-noir",
          label: "Silver Noir Rail",
          tokens: {
            "films-rail-bg-start": "#1f2228",
            "films-rail-bg-end": "#191b20",
            "films-rail-text": "#f0f3f8"
          }
        }
      ]
    },
    {
      id: "details",
      label: "Details Box",
      options: [
        {
          id: "cool-contrast",
          label: "Cool Contrast",
          tokens: {
            "films-content-bg-start": "#080f18",
            "films-content-bg-end": "#080d15",
            "films-content-subtitle": "#95b7e2",
            "films-content-title": "#f1f7ff",
            "films-content-body": "#d9e4f2"
          }
        },
        {
          id: "neutral-contrast",
          label: "Neutral Contrast",
          tokens: {
            "films-content-bg-start": "#11161f",
            "films-content-bg-end": "#10151d",
            "films-content-subtitle": "#b2bfd3",
            "films-content-title": "#f5f8ff",
            "films-content-body": "#d8dfec"
          }
        },
        {
          id: "warm-contrast",
          label: "Warm Contrast",
          tokens: {
            "films-content-bg-start": "#1a130f",
            "films-content-bg-end": "#18110d",
            "films-content-subtitle": "#d9b8a5",
            "films-content-title": "#fff3ec",
            "films-content-body": "#efdacf"
          }
        },
        {
          id: "aqua-contrast",
          label: "Aqua Contrast",
          tokens: {
            "films-content-bg-start": "#0b1e23",
            "films-content-bg-end": "#0a181d",
            "films-content-subtitle": "#8ed8dc",
            "films-content-title": "#ebffff",
            "films-content-body": "#c9edf0"
          }
        },
        {
          id: "sunset-contrast",
          label: "Sunset Contrast",
          tokens: {
            "films-content-bg-start": "#241611",
            "films-content-bg-end": "#1c120e",
            "films-content-subtitle": "#ebb384",
            "films-content-title": "#fff2e6",
            "films-content-body": "#f1d7c1"
          }
        },
        {
          id: "mono-contrast",
          label: "Mono Contrast",
          tokens: {
            "films-content-bg-start": "#171a21",
            "films-content-bg-end": "#12141a",
            "films-content-subtitle": "#b7becc",
            "films-content-title": "#f8faff",
            "films-content-body": "#dbe1ee"
          }
        }
      ]
    }
  ]
};

const SCOPES = ["home", "impact", "films"];

function normalizeHexColor(value, fallback) {
  const next = String(value ?? "").trim();
  return HEX_COLOR_RE.test(next) ? next.toLowerCase() : fallback;
}

function getScopeDefaults(scope) {
  return { ...(defaultControls?.[scope] ?? {}) };
}

function sanitizeScope(scope, rawScope) {
  const defaults = getScopeDefaults(scope);
  const sanitized = { ...defaults };
  Object.keys(defaults).forEach((token) => {
    sanitized[token] = normalizeHexColor(rawScope?.[token], defaults[token]);
  });
  return sanitized;
}

function getDefaultState() {
  return {
    home: sanitizeScope("home", defaultControls?.home),
    impact: sanitizeScope("impact", defaultControls?.impact),
    films: sanitizeScope("films", defaultControls?.films)
  };
}

function getDefaultPresetSelections() {
  return Object.fromEntries(
    SCOPES.map((scope) => [
      scope,
      Object.fromEntries(
        (PAGE_COLOR_THEME_CATEGORIES[scope] ?? []).map((category) => [
          category.id,
          category.options[0]?.id ?? ""
        ])
      )
    ])
  );
}

function sanitizePresetSelections(rawSelections) {
  const fallback = getDefaultPresetSelections();
  return Object.fromEntries(
    SCOPES.map((scope) => [
      scope,
      Object.fromEntries(
        (PAGE_COLOR_THEME_CATEGORIES[scope] ?? []).map((category) => {
          const stored = rawSelections?.[scope]?.[category.id];
          const found = category.options.some((option) => option.id === stored);
          return [category.id, found ? stored : fallback[scope][category.id]];
        })
      )
    ])
  );
}

function inferPresetSelectionForScope(scope, controls, fallbackSelections) {
  const categories = PAGE_COLOR_THEME_CATEGORIES[scope] ?? [];
  const next = { ...(fallbackSelections?.[scope] ?? {}) };
  categories.forEach((category) => {
    const matched = category.options.find((option) =>
      Object.entries(option.tokens).every(([token, value]) => controls[token] === value)
    );
    if (matched) {
      next[category.id] = matched.id;
    }
  });
  return next;
}

function parseStoredControls() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const payload = JSON.parse(raw);
    return {
      home: sanitizeScope("home", payload?.home),
      impact: sanitizeScope("impact", payload?.impact),
      films: sanitizeScope("films", payload?.films),
      presetSelections: sanitizePresetSelections(payload?.presetSelections)
    };
  } catch {
    return null;
  }
}

function triggerJsonDownload(payload, filename = "page-color-controls.json") {
  if (typeof window === "undefined") {
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function usePageColorControls(scope) {
  const [allControls, setAllControls] = useState(getDefaultState);
  const [presetSelections, setPresetSelections] = useState(getDefaultPresetSelections);

  useEffect(() => {
    const stored = parseStoredControls();
    if (!stored) {
      return;
    }
    setAllControls({
      home: sanitizeScope("home", stored.home),
      impact: sanitizeScope("impact", stored.impact),
      films: sanitizeScope("films", stored.films)
    });
    setPresetSelections({
      home: inferPresetSelectionForScope("home", stored.home, stored.presetSelections),
      impact: inferPresetSelectionForScope("impact", stored.impact, stored.presetSelections),
      films: inferPresetSelectionForScope("films", stored.films, stored.presetSelections)
    });
  }, []);

  const scopeControls = allControls[scope] ?? getScopeDefaults(scope);
  const categories = PAGE_COLOR_THEME_CATEGORIES[scope] ?? [];
  const scopeSelections = presetSelections[scope] ?? {};

  const styleVars = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(scopeControls).map(([token, value]) => [`--${token}`, value])
      ),
    [scopeControls]
  );

  const applyThemeCategory = useCallback(
    (categoryId, optionId) => {
      const category = (PAGE_COLOR_THEME_CATEGORIES[scope] ?? []).find(
        (entry) => entry.id === categoryId
      );
      const option = category?.options.find((entry) => entry.id === optionId);
      if (!category || !option) {
        return;
      }

      setAllControls((current) => ({
        ...current,
        [scope]: {
          ...(current[scope] ?? {}),
          ...option.tokens
        }
      }));
      setPresetSelections((current) => ({
        ...current,
        [scope]: {
          ...(current[scope] ?? {}),
          [categoryId]: option.id
        }
      }));
    },
    [scope]
  );

  const resetScope = useCallback(() => {
    const defaults = getDefaultState();
    const defaultPresets = getDefaultPresetSelections();
    setAllControls((current) => ({
      ...current,
      [scope]: defaults[scope]
    }));
    setPresetSelections((current) => ({
      ...current,
      [scope]: defaultPresets[scope]
    }));
  }, [scope]);

  const saveControlJson = useCallback(() => {
    const payload = {
      version: Number(defaultControls?.version) || 1,
      updated_at: new Date().toISOString(),
      home: sanitizeScope("home", allControls.home),
      impact: sanitizeScope("impact", allControls.impact),
      films: sanitizeScope("films", allControls.films),
      presetSelections: sanitizePresetSelections(presetSelections)
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          home: payload.home,
          impact: payload.impact,
          films: payload.films,
          presetSelections: payload.presetSelections
        })
      );
    }
    triggerJsonDownload(payload);
    return payload;
  }, [allControls, presetSelections]);

  return {
    categories,
    selectedThemes: scopeSelections,
    styleVars,
    applyThemeCategory,
    resetScope,
    saveControlJson
  };
}
