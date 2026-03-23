import { FinancialChart } from "../components/financial-chart";
import { FinancialEditorialBlocks } from "../components/financial-editorial-blocks";
import { LoadingPanel, ErrorPanel } from "../components/loading-panel";
import { getCharts, getFinancialEditorial } from "../lib/content";
import { useAsyncData } from "../lib/use-async-data";

const chartOrder = ["funding-flow-2024", "funding-milestones-2024"];

const editorialModuleOrder = ["navigating_challenges_funding", "who-we-work-with"];
const hiddenEditorialModuleIds = new Set(["fit_for_purpose_approach"]);

export function FinancialsPage() {
  const { loading, error, data } = useAsyncData(
    async () => {
      const [charts, editorial] = await Promise.all([getCharts(), getFinancialEditorial()]);
      return { charts, editorial };
    },
    []
  );

  if (loading) {
    return <LoadingPanel label="Loading financial charts..." />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load chart data." />;
  }

  const chartBySlug = new Map((data.charts ?? []).map((chart) => [chart.slug, chart]));
  const orderedCharts = chartOrder.map((slug) => chartBySlug.get(slug)).filter(Boolean);

  const modules = Array.isArray(data.editorial?.modules) ? data.editorial.modules : [];
  const editorialById = new Map(modules.map((module) => [module.id, module]));
  const orderedModules = editorialModuleOrder
    .map((id) => editorialById.get(id))
    .filter(Boolean)
    .filter((module) => !hiddenEditorialModuleIds.has(module.id));

  const fundingContextEditorial = {
    ...data.editorial,
    hero: null,
    modules: orderedModules.filter((module) => module.id === "navigating_challenges_funding"),
    supporters: null
  };

  const partnerContextEditorial = {
    ...data.editorial,
    hero: null,
    modules: orderedModules.filter((module) => module.id !== "navigating_challenges_funding"),
    supporters: data.editorial?.supporters ?? null
  };

  return (
    <div className="page-grid">
      <section className="panel panel--dark">
        <p className="section-kicker" style={{ color: "#9fd6c9" }}>
          Financials
        </p>
        <h1>Funding and Financial Performance</h1>
        <p>
          Follow the funding journey across 2024 disbursements and new commitments.
        </p>
        <p className="note" style={{ color: "rgba(242,233,220,0.82)" }}>
          Focuses on where funds moved in 2024 and what was newly committed.
        </p>
      </section>

      <FinancialEditorialBlocks editorial={fundingContextEditorial} />

      {orderedCharts.map((chart) => (
        <FinancialChart chart={chart} key={chart.slug} />
      ))}

      <FinancialEditorialBlocks editorial={partnerContextEditorial} />
    </div>
  );
}
