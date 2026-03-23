import { useCallback } from "react";
import { formatInteger } from "../lib/format";
import { getChartBySlug, getGlobalContent } from "../lib/content";
import { useAsyncData } from "../lib/use-async-data";
import { LoadingPanel, ErrorPanel } from "./loading-panel";
import { FinancialChart } from "./financial-chart";
import { reportPath } from "../lib/paths";

const threadsTimelineSlug = "evolution-grants-projects";
const externalReportUrl = String(import.meta.env.VITE_REPORT_URL ?? "").trim();

export function AboutPage() {
  const loadAboutData = useCallback(async () => {
    const [globalContent, threadsTimelineChart] = await Promise.all([
      getGlobalContent(),
      getChartBySlug(threadsTimelineSlug)
    ]);
    return { globalContent, threadsTimelineChart };
  }, []);
  const { loading, error, data } = useAsyncData(loadAboutData);

  const globalContent = data?.globalContent;
  const threadsTimelineChart = data?.threadsTimelineChart ?? null;

  if (loading) {
    return <LoadingPanel label="Loading methodology and about content..." />;
  }

  if (error || !globalContent) {
    return <ErrorPanel message="Unable to load about page content." />;
  }

  const institutionalPages = new Set([61, 72, 73, 75, 77]);
  const institutionalHighlights = globalContent.timeline.filter((item) => institutionalPages.has(item.source_page));
  const impactTimeline = globalContent.timeline
    .filter((item) => item.year <= 2024)
    .sort((left, right) => left.year - right.year);
  const chapterTransitions = [
    {
      title: "Part Two: Shoots of Change",
      summary:
        "The report shifts from global metrics into country-grounded tenure advances across Latin America, Africa, and Asia, emphasizing autonomous governance and legal defense pathways."
    },
    {
      title: "Part Three: Rooted in Trust",
      summary:
        "A funding chapter focused on fit-for-purpose finance, institutional strengthening, and donor-community trust architecture as the basis for scaling outcomes."
    },
    {
      title: "Part Four: Reaching Upward",
      summary:
        "Forward-looking section linking tenure rights to biodiversity, climate finance, and multi-year strategy through 2027."
    },
    {
      title: "Closing Outlook",
      summary:
        "The final pages position tenure as a long-term systems strategy and highlight leadership transition, continuity, and strategic next steps."
    }
  ];

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          About / Method / Download
        </p>
        <h1>Mission, approach, and methodology</h1>
        <p>
          The platform mirrors the annual report&apos;s rights-based framing and translates it into an explorable digital
          format without changing the original narrative intent.
        </p>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Vision</h2>
          <p>{globalContent.about.vision}</p>

          <h2 style={{ marginTop: "1rem" }}>Mission</h2>
          <p>{globalContent.about.mission}</p>
        </section>

        <section className="panel">
          <h2>Organisational values</h2>
          <ul>
            {globalContent.about.values.map((value) => (
              <li key={value.name}>
                <strong>{value.name}:</strong> {value.description}
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
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Impact Timeline</h2>
        <p className="note">Moved from the Impact workspace for focused methodological review.</p>
        <div className="timeline-track" style={{ marginTop: "0.65rem" }}>
          {impactTimeline.map((milestone) => (
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
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Threads in the Tapestry Timeline</h2>
        <p className="note">Moved from Financials to About for strategic and institutional context.</p>
        {threadsTimelineChart ? (
          <FinancialChart chart={threadsTimelineChart} />
        ) : (
          <p className="note">Timeline chart is unavailable.</p>
        )}
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
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Chapter Transition Highlights</h2>
        <p className="note">
          Added to ensure section-opening narrative pages are represented alongside KPI and country evidence modules.
        </p>
        <div className="grid-2" style={{ marginTop: "0.65rem" }}>
          {chapterTransitions.map((chapter) => (
            <article key={chapter.title} className="panel" style={{ margin: 0 }}>
              <h3>{chapter.title}</h3>
              <p>{chapter.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>What do we mean by securing tenure?</h2>
          <p>{globalContent.glossary.find((item) => item.term === "Securing tenure")?.definition}</p>
        </section>

        <section className="panel">
          <h2>Methodology note</h2>
          <p>{globalContent.methodology.summary}</p>
          <p className="note">
            Geometries in country pages include supplemental GeoJSON for narrative exploration where detailed polygon
            data is not embedded in the PDF itself.
          </p>
        </section>
      </div>

      <section className="panel">
        <h2>Download</h2>
        <p>
          <a
            href={
              externalReportUrl.length
                ? externalReportUrl
                : reportPath("tenure-facility-annual-report-2024.pdf")
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Download the Tenure Facility Annual Report 2024 (PDF)
          </a>
        </p>
      </section>
    </div>
  );
}
