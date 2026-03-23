import { FinancialChart } from "@/components/financial-chart";
import { SourcePill } from "@/components/source-pill";
import { getCharts } from "@/lib/content";

const coreOrder = [
  "impact-growth-2023-2024",
  "evolution-grants-projects",
  "funding-flow-2024",
  "funding-milestones-2024",
  "institutional-development-2024"
];

export default async function FinancialsPage() {
  const charts = await getCharts();

  const ordered = [
    ...coreOrder
      .map((slug) => charts.find((chart) => chart.slug === slug))
      .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart)),
    ...charts.filter((chart) => !coreOrder.includes(chart.slug))
  ];

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          Financials
        </p>
        <h1>Interactive financial and growth charts</h1>
        <p>
          This section reconstructs report charts using values visible in the 2024 annual report, with hoverable values,
          unit display, source-page traceability, raw-data table toggles, and provenance notes for every visual.
        </p>
        <p className="note" style={{ color: "rgba(242,233,220,0.82)" }}>
          Includes disbursement-related visuals (p.8 and p.62), evolution timeline growth visuals (p.24), and 2024
          funding milestones (p.76).
        </p>
      </section>

      <section className="panel">
        <h2>Chart methodology</h2>
        <p>
          Values are transcribed from visible report figures and captions. No additional filters dependent on unseen raw
          datasets are introduced. Figure-specific chart configs control axes, units, and series behavior.
        </p>
        <div className="controls-row" aria-label="Source pages">
          <SourcePill page={8} />
          <SourcePill page={24} />
          <SourcePill page={62} />
          <SourcePill page={76} />
        </div>
      </section>

      {ordered.map((chart) => (
        <FinancialChart chart={chart} key={chart.slug} />
      ))}
    </div>
  );
}
