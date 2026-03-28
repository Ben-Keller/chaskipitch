import { useCallback, useEffect, useMemo, useState } from "react";
import { getCharts, getFinancialEditorial, getGlobalContent } from "../lib/content";
import { formatInteger } from "../lib/format";
import { useAsyncData } from "../lib/use-async-data";
import { FinancialChart } from "./financial-chart";
import { FinancialEditorialBlocks } from "./financial-editorial-blocks";
import { LoadingPanel, ErrorPanel } from "./loading-panel";

const THREADS_TIMELINE_SLUG = "evolution-grants-projects";
const DUAL_AXIS_TREND_SLUG = "projects-funding-over-time";
const CHART_WORKBENCH_ORDER = [
  DUAL_AXIS_TREND_SLUG,
  "funding-flow-2024",
  "funding-milestones-2024",
  "impact-growth-2023-2024"
];
const INSTITUTIONAL_PAGES = new Set([61, 72, 73, 75, 77]);
const TIMELINE_VIEW_OPTIONS = [
  { key: "stage", label: "Selected phase" },
  { key: "institutional", label: "Institutional milestones" },
  { key: "all", label: "All milestones" }
];

function parseStageRange(periodLabel) {
  const label = String(periodLabel ?? "").trim();
  if (!label) {
    return null;
  }

  const rangeMatch = label.match(/(\d{4})\s*-\s*(\d{4})/);
  if (rangeMatch) {
    return { start: Number(rangeMatch[1]), end: Number(rangeMatch[2]) };
  }

  const singleYearMatch = label.match(/^(\d{4})$/);
  if (singleYearMatch) {
    const year = Number(singleYearMatch[1]);
    return { start: year, end: year };
  }

  const beyondMatch = label.match(/(\d{4})\s*&\s*beyond/i);
  if (beyondMatch) {
    return { start: Number(beyondMatch[1]), end: Number.POSITIVE_INFINITY };
  }

  return null;
}

function yearInRange(year, range) {
  if (!Number.isFinite(year) || !range) {
    return false;
  }
  return year >= range.start && year <= range.end;
}

function cleanReportLanguage(text) {
  const value = String(text ?? "").trim();
  if (!value) {
    return "";
  }

  return value
    .replace(/\bfigure\s*\d+\b:?/gi, "")
    .replace(/\bpage\s*\d+\b:?/gi, "")
    .replace(/\bpart\s+[a-z0-9]+\b:?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function sanitizeChartForDisplay(chart) {
  if (!chart) {
    return null;
  }
  return {
    ...chart,
    title: cleanReportLanguage(chart.title) || chart.title
  };
}

function formatMilestoneMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return "";
  }
  return Object.entries(metrics)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${formatInteger(value)}`)
    .join(" | ");
}

export function EvolutionDashboardPage() {
  const loadEvolutionData = useCallback(async () => {
    const [globalContent, charts, editorial] = await Promise.all([
      getGlobalContent(),
      getCharts(),
      getFinancialEditorial()
    ]);
    return { globalContent, charts, editorial };
  }, []);

  const { loading, error, data } = useAsyncData(loadEvolutionData);
  const [selectedStageIndex, setSelectedStageIndex] = useState(Number.MAX_SAFE_INTEGER);
  const [timelineViewKey, setTimelineViewKey] = useState("stage");

  const globalContent = data?.globalContent ?? null;
  const editorial = data?.editorial ?? null;
  const chartBySlug = useMemo(
    () => new Map((data?.charts ?? []).map((chart) => [chart.slug, chart])),
    [data?.charts]
  );

  const threadsTimelineChart = useMemo(
    () => sanitizeChartForDisplay(chartBySlug.get(THREADS_TIMELINE_SLUG)),
    [chartBySlug]
  );

  const timelineStages = Array.isArray(threadsTimelineChart?.data_points)
    ? threadsTimelineChart.data_points
    : [];

  useEffect(() => {
    if (!timelineStages.length) {
      return;
    }
    if (selectedStageIndex > timelineStages.length - 1) {
      setSelectedStageIndex(timelineStages.length - 1);
    }
  }, [selectedStageIndex, timelineStages.length]);

  const normalizedStageIndex = timelineStages.length
    ? Math.min(selectedStageIndex, timelineStages.length - 1)
    : -1;
  const selectedStage = normalizedStageIndex >= 0 ? timelineStages[normalizedStageIndex] : null;
  const latestStage = timelineStages[timelineStages.length - 1] ?? null;
  const activeStage = selectedStage ?? latestStage;
  const selectedStageRange = parseStageRange(activeStage?.period);

  const impactTimeline = useMemo(
    () =>
      [...(globalContent?.timeline ?? [])]
        .filter((item) => item.year <= 2024)
        .sort((left, right) => left.year - right.year),
    [globalContent?.timeline]
  );

  const stageAlignedMilestones = useMemo(() => {
    if (!activeStage || !selectedStageRange) {
      return impactTimeline;
    }

    const scoped = impactTimeline.filter((milestone) =>
      yearInRange(milestone.year, selectedStageRange)
    );
    if (scoped.length) {
      return scoped;
    }

    if (selectedStageRange.end === Number.POSITIVE_INFINITY) {
      return impactTimeline.filter((milestone) => milestone.year >= selectedStageRange.start);
    }

    return impactTimeline;
  }, [activeStage, impactTimeline, selectedStageRange]);

  const institutionalHighlights = useMemo(
    () => impactTimeline.filter((item) => INSTITUTIONAL_PAGES.has(item.source_page)),
    [impactTimeline]
  );

  const visibleMilestones = useMemo(() => {
    if (timelineViewKey === "institutional") {
      return institutionalHighlights;
    }
    if (timelineViewKey === "all") {
      return impactTimeline;
    }
    return stageAlignedMilestones;
  }, [impactTimeline, institutionalHighlights, stageAlignedMilestones, timelineViewKey]);

  const timelineStreamLabel =
    timelineViewKey === "institutional"
      ? "Institutional milestones through 2024"
      : timelineViewKey === "all"
        ? "Complete milestone timeline through 2024"
        : activeStage
          ? `Milestones aligned to ${activeStage.period}`
          : "Milestones aligned to selected phase";

  const stackedCharts = useMemo(
    () =>
      CHART_WORKBENCH_ORDER
        .map((slug) => sanitizeChartForDisplay(chartBySlug.get(slug)))
        .filter(Boolean),
    [chartBySlug]
  );

  if (loading) {
    return <LoadingPanel label="Loading evolution and funding dashboard..." />;
  }

  if (error || !globalContent) {
    return <ErrorPanel message="Unable to load evolution dashboard content." />;
  }

  return (
    <div className="page-grid evolution-dashboard">
      <section className="panel evolution-workbench">
        <p className="section-kicker">Evolution & Finance</p>
        <h1>Evolution and Funding Dashboard</h1>
        <h2>Growth Timeline</h2>
        {threadsTimelineChart ? (
          <FinancialChart
            chart={threadsTimelineChart}
            selectedTimelineIndex={normalizedStageIndex}
            onTimelineSelect={setSelectedStageIndex}
            hideTimelineStageGrid
          />
        ) : (
          <p className="note">Growth timeline is unavailable.</p>
        )}

        <div className="dashboard-chart-switcher" role="tablist" aria-label="Milestone modes">
          {TIMELINE_VIEW_OPTIONS.map((option) => {
            const isActive = timelineViewKey === option.key;
            return (
              <button
                key={option.key}
                type="button"
                className={isActive ? "active" : undefined}
                aria-selected={isActive}
                onClick={() => setTimelineViewKey(option.key)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="note">{timelineStreamLabel}</p>

        {visibleMilestones.length ? (
          <div className="timeline-track" style={{ marginTop: "0.35rem" }}>
            {visibleMilestones.map((milestone) => (
              <article
                className="timeline-item"
                key={`${milestone.year}-${milestone.label}-${milestone.source_page}`}
              >
                <h3>{milestone.year}</h3>
                <p>
                  <strong>{cleanReportLanguage(milestone.label)}</strong>
                </p>
                <p>{cleanReportLanguage(milestone.description)}</p>
                {milestone.metrics ? <p className="note">{formatMilestoneMetrics(milestone.metrics)}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="note">No milestones available for the selected mode.</p>
        )}
      </section>

      <section className="panel evolution-chart-grid">
        <h2>Funding and Impact Charts</h2>
        <div className="evolution-chart-grid__stack">
          {stackedCharts.length ? (
            stackedCharts.map((chart) => <FinancialChart key={chart.slug} chart={chart} compact />)
          ) : (
            <p className="note">No charts are available.</p>
          )}
        </div>
      </section>

      <FinancialEditorialBlocks
        editorial={editorial}
        showHero={false}
        showSources={false}
        hiddenModuleIds={["fit_for_purpose_approach", "navigating_challenges_funding"]}
      />
    </div>
  );
}
