import Link from "next/link";
import { notFound } from "next/navigation";
import { FinancialChart } from "@/components/financial-chart";
import { KpiStrip } from "@/components/kpi-strip";
import { SourcePill } from "@/components/source-pill";
import { getChartBySlug, getCountries, getCountrySignalsByIso, getGlobalContent, getThemeBySlug } from "@/lib/content";
import { formatUnit } from "@/lib/format";

interface ThemeDetailPageProps {
  params: {
    slug: string;
  };
}

export default async function ThemeDetailPage({ params }: ThemeDetailPageProps) {
  const [theme, globalContent] = await Promise.all([getThemeBySlug(params.slug), getGlobalContent()]);

  if (!theme) {
    notFound();
  }

  const countries = await getCountries();
  const relatedCountries = countries.filter((country) => theme.related_countries.includes(country.iso3));
  const relatedCountrySignals = (
    await Promise.all(relatedCountries.map((country) => getCountrySignalsByIso(country.iso3)))
  ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const themeSignalKpis = relatedCountrySignals
    .flatMap((countrySignals) =>
      countrySignals.kpis
        .filter((kpi) => kpi.theme_tags.includes(theme.slug))
        .map((kpi) => ({ ...kpi, iso3: countrySignals.iso3, country_name: countrySignals.country_name }))
    )
    .slice(0, 18);

  const themeSignalNarratives = relatedCountrySignals
    .flatMap((countrySignals) =>
      countrySignals.narratives
        .filter((entry) => entry.theme_tags.includes(theme.slug))
        .map((entry) => ({ ...entry, iso3: countrySignals.iso3, country_name: countrySignals.country_name }))
    )
    .slice(0, 14);

  const primaryThemeSignalKpis = themeSignalKpis.slice(0, 8);
  const overflowThemeSignalKpis = themeSignalKpis.slice(8);
  const primaryThemeSignalNarratives = themeSignalNarratives.slice(0, 6);
  const overflowThemeSignalNarratives = themeSignalNarratives.slice(6);

  const sourcePagesForThemeSignals = Array.from(
    new Set([...themeSignalKpis.map((kpi) => kpi.source_page), ...themeSignalNarratives.map((entry) => entry.source_page)])
  ).sort((left, right) => left - right);

  const relatedCharts = (
    await Promise.all(theme.related_charts.map(async (slug) => getChartBySlug(slug)))
  ).filter((chart): chart is NonNullable<typeof chart> => Boolean(chart));

  const derivationsByKpiId = Object.fromEntries(
    (globalContent.kpi_derivation_registry ?? []).map((entry) => [entry.kpi_id, entry])
  );

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          Thematic view
        </p>
        <h1>{theme.name}</h1>
        <p>{theme.description}</p>
        <p className="note" style={{ color: "rgba(242,233,220,0.82)" }}>
          Source pages: {theme.source_pages.join(", ")}
        </p>
      </section>

      <section className="panel">
        <h2>Theme KPI set</h2>
        <KpiStrip kpis={theme.kpis} derivationsByKpiId={derivationsByKpiId} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Related countries</h2>
          <ul>
            {relatedCountries.map((country) => (
              <li key={country.iso3}>
                <Link href={`/countries/${country.iso3}`}>{country.name}</Link> | {country.project_count} projects | {" "}
                <SourcePill
                  page={
                    Array.isArray(country.metrics.source_page)
                      ? (country.metrics.source_page[0] as number)
                      : (country.metrics.source_page as number)
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Related stories</h2>
          <ul>
            {theme.related_stories.map((story) => (
              <li key={story}>{story}</li>
            ))}
          </ul>
          <p className="note" style={{ marginTop: "0.5rem" }}>
            Source anchors: {theme.source_pages.join(", ")}
          </p>
        </section>
      </div>

      {themeSignalKpis.length || themeSignalNarratives.length ? (
        <section className="panel">
          <h2>Extracted cross-country evidence</h2>
          <p className="note">
            Supplementary evidence signals normalized from `tenure_facility_country_jsons_v4`, filtered to this theme.
          </p>
          <div className="grid-2">
            <article>
              <h3>Signal KPIs</h3>
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
              <h3>Signal narratives</h3>
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
            <p className="note" style={{ marginTop: "0.7rem" }}>
              Theme signal source pages: {sourcePagesForThemeSignals.join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="page-grid">
        {relatedCharts.map((chart) => (
          <FinancialChart key={chart.slug} chart={chart} />
        ))}
      </section>

      <section className="panel">
        <div className="controls-row">
          <Link href="/thematics">Back to all themes</Link>
          <Link href="/">Home</Link>
          <Link href="/financials">Financials</Link>
        </div>
      </section>
    </div>
  );
}
