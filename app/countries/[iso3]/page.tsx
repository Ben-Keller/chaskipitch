import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CountryBackButton } from "@/components/country-back-button";
import { CountryMap } from "@/components/country-map";
import { SourcePill } from "@/components/source-pill";
import { getCountryByIso, getCountryGeo, getCountrySignalsByIso, getGlobalContent, getMediaIndex } from "@/lib/content";
import { formatInteger, formatUnit } from "@/lib/format";

interface CountryPageProps {
  params: { iso3: string };
}

function prettyMetricLabel(key: string): string {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetricValue(value: string | number | boolean | number[]): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? formatInteger(value) : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return value;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trimEnd()}...`;
}

export default async function CountryPage({ params }: CountryPageProps) {
  const iso3 = params.iso3.toUpperCase();
  const [country, boundaryGeo, territoryGeo, globalContent, mediaIndex, countrySignals] = await Promise.all([
    getCountryByIso(iso3),
    getCountryGeo(iso3, "boundary"),
    getCountryGeo(iso3, "territories"),
    getGlobalContent(),
    getMediaIndex(),
    getCountrySignalsByIso(iso3)
  ]);

  if (!country) {
    notFound();
  }

  const statusInfo = globalContent.status_definitions.find((definition) => definition.id === country.status);

  const photos = country.media.photos
    .map((file) => mediaIndex.photos.find((photo) => photo.file === file))
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));

  const sourcePageRaw = country.metrics.source_page;
  const sourcePage = Array.isArray(sourcePageRaw)
    ? (sourcePageRaw[0] as number)
    : typeof sourcePageRaw === "number"
      ? sourcePageRaw
      : 25;

  const signalKpis = (countrySignals?.kpis ?? []).slice(0, 10);
  const signalNarratives = (countrySignals?.narratives ?? []).slice(0, 7);
  const primarySignalKpis = signalKpis.slice(0, 5);
  const overflowSignalKpis = signalKpis.slice(5);
  const primarySignalNarratives = signalNarratives.slice(0, 4);
  const overflowSignalNarratives = signalNarratives.slice(4);

  return (
    <div className="page-grid">
      <section className="country-scene">
        <div
          className="country-backdrop"
          style={{
            backgroundImage: `url(/media/${photos[0]?.file ?? "report-page-23.jpg"})`
          }}
          aria-hidden="true"
        />
        <div className="country-content">
          <div style={{ display: "grid", gap: "1rem" }}>
            <article className="float-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem" }}>
                <div>
                  <p className="section-kicker" style={{ color: "#9fd6c9" }}>
                    Country Explorer
                  </p>
                  <h1>{country.name}</h1>
                </div>
                <CountryBackButton iso3={country.iso3} />
              </div>
              <p style={{ marginTop: "0.7rem" }}>{country.summary}</p>
              <p className="note" style={{ color: "rgba(246,236,215,0.82)" }}>
                Status: {statusInfo?.label ?? country.status} | Project count: {country.project_count}
              </p>
              <div className="tag-row" style={{ marginTop: "0.5rem" }}>
                {country.thematics.map((theme) => (
                  <Link key={theme} href={`/thematics/${theme}`} className="tag">
                    {theme.replaceAll("-", " ")}
                  </Link>
                ))}
              </div>
              <div className="controls-row" style={{ marginTop: "0.6rem" }}>
                <a href="#country-geography">Geography</a>
                <a href="#country-stories">Stories</a>
                {countrySignals ? <a href="#country-signals">Signals</a> : null}
                <a href="#country-gallery">Gallery</a>
              </div>
            </article>

            <article className="float-card">
              <h2>Impact highlights</h2>
              <ul>
                {country.featured_achievements.map((achievement) => (
                  <li key={achievement}>{achievement}</li>
                ))}
              </ul>
              <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                Source pages: {Array.isArray(sourcePageRaw) ? sourcePageRaw.join(", ") : sourcePageRaw}
              </p>
            </article>

            <article className="float-card">
              <h2>Key metrics</h2>
              <ul>
                {Object.entries(country.metrics)
                  .filter(([key]) => key !== "source_page")
                  .map(([key, value]) => (
                    <li key={key}>
                      <strong>{prettyMetricLabel(key)}:</strong> {formatMetricValue(value)}
                    </li>
                  ))}
              </ul>
            </article>

            <article className="float-card">
              <h2>Project portfolio</h2>
              <ul>
                {country.projects.map((project) => (
                  <li key={project.project_id}>
                    <strong>{project.project_name}</strong> ({project.project_id}) | {project.lifecycle_status} |{" "}
                    {project.implementation_status}
                    <br />
                    <span>{project.summary}</span>
                  </li>
                ))}
              </ul>
              <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                Project-level data model introduced in Phase 1. Values are placeholder-seeded pending verified project
                records.
              </p>
            </article>

            {countrySignals ? (
              <article className="float-card" id="country-signals">
                <h2>Extracted KPI signals</h2>
                <ul>
                  {primarySignalKpis.map((kpi) => (
                    <li key={kpi.id}>
                      <strong>{kpi.label}:</strong> {formatUnit(kpi.value, kpi.unit)}
                      {"  "}
                      <SourcePill page={kpi.source_page} />
                      <br />
                      <span className="note" style={{ color: "rgba(243,232,210,0.75)" }}>
                        {kpi.metric_family} | {kpi.direction} | {kpi.theme_tags.join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {overflowSignalKpis.length ? (
                  <details className="inline-disclosure">
                    <summary>Show {overflowSignalKpis.length} more KPI signals</summary>
                    <ul style={{ marginTop: "0.4rem" }}>
                      {overflowSignalKpis.map((kpi) => (
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
                  {countrySignals.status_mismatch
                    ? `Status requires review (mapped: ${countrySignals.mapped_status}, live: ${countrySignals.live_status}).`
                    : "Status mapping aligns with live country record."}
                </p>
              </article>
            ) : null}

            <article className="float-card">
              <h2>Partners</h2>
              <p>{country.partners.join(" | ")}</p>
              <p className="story-quote" style={{ fontSize: "1.06rem", marginTop: "0.8rem" }}>
                "{country.quote.text}"
              </p>
              <p className="note" style={{ color: "rgba(245,235,217,0.72)" }}>
                {country.quote.attribution} <SourcePill page={country.quote.source_page} />
              </p>
            </article>
          </div>

          <div style={{ display: "grid", gap: "1rem", alignContent: "start" }}>
            <article className="float-card" id="country-geography">
              <h2>Project geography</h2>
              <p className="note" style={{ color: "rgba(243,232,210,0.8)" }}>
                Authoritative country boundaries are paired with territory overlays for protected or governed areas.
              </p>
              <CountryMap boundaryGeo={boundaryGeo} territoryGeo={territoryGeo} />
              <p className="note" style={{ color: "rgba(243,232,210,0.7)", marginTop: "0.5rem" }}>
                Boundary source: geo/countries_manifest.json | Territory overlays: supplemental GeoJSON |{" "}
                <SourcePill page={sourcePage} />
              </p>
            </article>

            <article className="float-card" id="country-stories">
              <h2>Stories from the report</h2>
              <ul>
                {country.stories.map((story) => (
                  <li key={story.title}>
                    <strong>{story.title}:</strong> {story.summary} <SourcePill page={story.source_page} />
                  </li>
                ))}
              </ul>
            </article>

            {countrySignals ? (
              <article className="float-card">
                <h2>Additional narrative evidence</h2>
                <ul>
                  {primarySignalNarratives.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <strong>{item.title}</strong> ({item.kind.replaceAll("_", " ")}) <SourcePill page={item.source_page} />
                      <br />
                      <span>{truncate(item.body, 240)}</span>
                    </li>
                  ))}
                </ul>
                {overflowSignalNarratives.length ? (
                  <details className="inline-disclosure">
                    <summary>Show {overflowSignalNarratives.length} more narratives</summary>
                    <ul style={{ marginTop: "0.4rem" }}>
                      {overflowSignalNarratives.map((item) => (
                        <li key={`${item.kind}-${item.id}`}>
                          <strong>{item.title}</strong> <SourcePill page={item.source_page} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <p className="note" style={{ color: "rgba(243,232,210,0.75)", marginTop: "0.5rem" }}>
                  Source pages covered by extracted signals: {countrySignals.source_pages.join(", ")}.
                </p>
              </article>
            ) : null}

            <article className="float-card" id="country-gallery">
              <h2>Photo gallery</h2>
              <div className="media-grid">
                {photos.length ? (
                  photos.map((photo) => (
                    <figure key={photo.id}>
                      <Image
                        src={`/media/${photo.file}`}
                        alt={photo.alt}
                        width={960}
                        height={680}
                        sizes="(max-width: 760px) 100vw, (max-width: 1100px) 90vw, 33vw"
                        className="media-grid__image"
                      />
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

            {country.media.videos.length ? (
              <article className="float-card">
                <h2>Video</h2>
                {country.media.videos.map((video) => (
                  <div key={video.url}>
                    <p>{video.title}</p>
                    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%" }}>
                      <iframe
                        src={video.url}
                        title={video.title}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, borderRadius: "12px" }}
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

      <section className="panel">
        <p className="section-kicker">Back to navigation</p>
        <div className="controls-row">
          <Link href="/">Home / Global Impact</Link>
          <Link href="/countries">Country Explorer</Link>
          <Link href="/thematics">Thematics</Link>
          <Link href="/financials">Financials</Link>
        </div>
      </section>
    </div>
  );
}
