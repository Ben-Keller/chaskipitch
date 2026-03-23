import Link from "next/link";
import { SourcePill } from "@/components/source-pill";
import { getGlobalContent } from "@/lib/content";
import { formatInteger } from "@/lib/format";

export default async function AboutPage() {
  const globalContent = await getGlobalContent();
  const institutionalPages = new Set([61, 72, 73, 75, 77]);
  const institutionalHighlights = globalContent.timeline.filter((item) =>
    institutionalPages.has(item.source_page)
  );

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          About / Method / Download
        </p>
        <h1>Mission, approach, and methodology</h1>
        <p>
          The platform mirrors the annual report's rights-based framing and translates it into an explorable digital
          format without changing the original narrative intent.
        </p>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Vision</h2>
          <p>{globalContent.about.vision}</p>
          <SourcePill page={7} />

          <h2 style={{ marginTop: "1rem" }}>Mission</h2>
          <p>{globalContent.about.mission}</p>
          <SourcePill page={7} />
        </section>

        <section className="panel">
          <h2>Organisational values</h2>
          <ul>
            {globalContent.about.values.map((value) => (
              <li key={value.name}>
                <strong>{value.name}:</strong> {value.description} <SourcePill page={value.source_page} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <h2>The four pillars of the approach</h2>
        <div className="grid-2" style={{ marginTop: "0.6rem" }}>
          {globalContent.about.pillars.map((pillar) => (
            <article key={pillar.title} className="panel" style={{ margin: 0 }}>
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
              <SourcePill page={pillar.source_page} />
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Institutional Development Highlights (2024)</h2>
        <p className="note">
          Additional governance and organizational signals extracted from Part Three of the report.
        </p>
        <div className="timeline-track" style={{ marginTop: "0.65rem" }}>
          {institutionalHighlights.map((milestone) => (
            <article className="timeline-item" key={`${milestone.year}-${milestone.label}`}>
              <h3>{milestone.year}</h3>
              <p>
                <strong>{milestone.label}</strong>
              </p>
              <p>{milestone.description}</p>
              {milestone.metrics ? (
                <p className="note">
                  {Object.entries(milestone.metrics)
                    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${formatInteger(value)}`)
                    .join(" | ")}
                </p>
              ) : null}
              <SourcePill page={milestone.source_page} />
            </article>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>What do we mean by securing tenure?</h2>
          <p>{globalContent.glossary.find((item) => item.term === "Securing tenure")?.definition}</p>
          <SourcePill page={22} />
        </section>

        <section className="panel">
          <h2>Methodology note</h2>
          <p>{globalContent.methodology.summary}</p>
          <p className="note">Source pages: {globalContent.methodology.source_pages.join(", ")}</p>
          <p className="note">
            Geometries in country pages include supplemental GeoJSON for narrative exploration where detailed polygon
            data is not embedded in the PDF itself.
          </p>
        </section>
      </div>

      <section className="panel">
        <h2>Download</h2>
        <p>
          <Link href="/report/tenure-facility-annual-report-2024.pdf" target="_blank" rel="noopener noreferrer">
            Download the Tenure Facility Annual Report 2024 (PDF)
          </Link>
        </p>
      </section>
    </div>
  );
}
