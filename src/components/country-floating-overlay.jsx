import { formatInteger } from "../lib/format";
import { SourcePill } from "./source-pill";

function toTitleCase(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMetricValue(value) {
  if (typeof value === "number") {
    return formatInteger(value);
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function getSourcePage(country) {
  const rawSourcePage = country.metrics?.source_page;
  if (Array.isArray(rawSourcePage) && typeof rawSourcePage[0] === "number") {
    return rawSourcePage[0];
  }
  if (typeof rawSourcePage === "number") {
    return rawSourcePage;
  }
  return 25;
}

function getHighlightMetrics(country) {
  const entries = Object.entries(country.metrics ?? {})
    .filter(([key, value]) => key !== "source_page" && key !== "project_count" && value !== null && value !== undefined)
    .slice(0, 4);
  if (!entries.length) {
    return [["project_count", country.project_count]];
  }
  return entries;
}

function storyLabel(story) {
  if (typeof story === "string") {
    return story;
  }

  if (story && typeof story.title === "string") {
    return story.title;
  }

  return "Story";
}

export function CountryFloatingOverlay({ country, statusInfo, onClose, onThemeSelect }) {
  if (!country) {
    return null;
  }

  const sourcePage = getSourcePage(country);
  const metrics = getHighlightMetrics(country);
  const stories = country.stories?.slice(0, 3) ?? [];
  const achievements = country.featured_achievements?.slice(0, 3) ?? [];
  const partners = country.partners?.slice(0, 4) ?? [];

  return (
    <div
      className="map-country-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={`${country.name} detail overlay`}
    >
      <article className="map-float-card map-float-card--summary">
        <div className="map-float-card__top">
          <p className="section-kicker">Country Story</p>
          <button type="button" className="map-float-close" onClick={onClose} aria-label="Close country overlay">
            Close
          </button>
        </div>
        <h3>{country.name}</h3>
        <p>{country.summary}</p>
        <p className="note">
          Status: {statusInfo?.label ?? country.status} | Projects: {country.project_count}
        </p>
        <div className="tag-row">
          {country.thematics?.slice(0, 6).map((theme) => (
            <button
              key={theme}
              type="button"
              className="tag tag-button"
              onClick={() => {
                if (typeof onThemeSelect === "function") {
                  onThemeSelect(theme);
                }
              }}
            >
              {theme.replaceAll("-", " ")}
            </button>
          ))}
        </div>
        <div className="controls-row" style={{ marginTop: "0.6rem" }}>
          <a href="#country-details">View full country details below map</a>
          <SourcePill page={sourcePage} />
        </div>
      </article>

      <article className="map-float-card map-float-card--metrics">
        <h4>Impact highlights</h4>
        <ul>
          {metrics.map(([key, value]) => (
            <li key={key}>
              <strong>{toTitleCase(key)}:</strong> {formatMetricValue(value)}
            </li>
          ))}
        </ul>
        {partners.length ? (
          <>
            <h4 style={{ marginTop: "0.55rem" }}>Partners</h4>
            <ul>
              {partners.map((partner) => (
                <li key={partner}>{partner}</li>
              ))}
            </ul>
          </>
        ) : null}
      </article>

      <article className="map-float-card map-float-card--stories">
        <h4>Featured stories</h4>
        {stories.length ? (
          <ul>
            {stories.map((story) => (
              <li key={typeof story === "string" ? story : story.title}>{storyLabel(story)}</li>
            ))}
          </ul>
        ) : (
          <p>No story excerpt available yet.</p>
        )}

        {achievements.length ? (
          <>
            <h4 style={{ marginTop: "0.6rem" }}>Achievements</h4>
            <ul>
              {achievements.map((achievement) => (
                <li key={achievement}>{achievement}</li>
              ))}
            </ul>
          </>
        ) : null}
      </article>
    </div>
  );
}
