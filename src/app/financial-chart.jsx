import { useEffect, useId, useMemo, useState } from "react";
import {
  arc as d3Arc,
  curveMonotoneX,
  line as d3Line,
  max,
  pie as d3Pie,
  scaleBand,
  scaleLinear
} from "d3";
import { formatUnit } from "../lib/format";
import { mediaPath } from "../lib/paths";

const width = 860;
const height = 320;
const margin = { top: 22, right: 74, bottom: 70, left: 74 };

function toNumeric(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return 0;
}

function inferDefaultXKey(chart) {
  const first = chart.data_points[0] ?? {};
  if ("year" in first) return "year";
  if ("label" in first) return "label";
  if ("metric" in first) return "metric";
  return Object.keys(first)[0] ?? "label";
}

function entryLabel(entry, xKey) {
  const xValue = entry[xKey];
  if (typeof xValue === "string" || typeof xValue === "number") {
    return String(xValue);
  }

  if (typeof entry.label === "string") return entry.label;
  if (typeof entry.metric === "string") return entry.metric;
  if (typeof entry.year === "number") return String(entry.year);
  return "Value";
}

function prettyColumnLabel(key) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function defaultSeriesForChart(chart) {
  const defaultType = chart.chart_type === "line" ? "line" : "bar";
  return [
    {
      key: "value",
      label: chart.title,
      type: defaultType,
      axis: "left",
      color: chart.chart_type === "stacked_bar" ? "#a74d3f" : "#2f7f73",
      unit: chart.units
    }
  ];
}

function findValueByLabel(points, label) {
  const row = points.find((point) => String(point.label).toLowerCase() === String(label).toLowerCase());
  return row ? toNumeric(row.value) : 0;
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

const THREADS_REPORT_STAGE_BOUNDS = [
  [0.052, 0.244],
  [0.244, 0.409],
  [0.409, 0.515],
  [0.515, 0.623],
  [0.623, 0.768],
  [0.768, 0.975]
];

const THREADS_REPORT_CALLOUTS = {
  "2012-2017": [
    "2012: Rights and Resources Initiative begins consultations on a financial mechanism to support communities to strengthen tenure rights.",
    "2015: Six pilot projects are launched.",
    "2017: Tenure Facility is formally founded as an independent NGO."
  ],
  "2018-2020": [
    "2018-2019: First grant is awarded and work expands to three new countries.",
    "2020: US$5.6M is disbursed across 12 partners."
  ],
  "2021": [
    "13 projects and US$5M grants.",
    "Tenure Facility becomes a TED Audacious grantee.",
    "TED Talk and COP26 boost global visibility."
  ],
  "2022": [
    "14 projects and US$12M grants.",
    "Tenure Facility becomes a Bezos Earth Fund grantee."
  ],
  "2023": [
    "29 projects and US$26M grants.",
    "ROOTS framework becomes operational.",
    "2023-2027 strategy launches with a goal to secure 60M ha of land."
  ],
  "2024 & beyond": [
    "35 projects and US$30M disbursed.",
    "UK invests GBP 94M in Amazon Catalyst.",
    "Measurable progress toward 34M hectares.",
    "New teams established and Advisory Group relaunched."
  ]
};

export function FinancialChart({
  chart,
  compact = false,
  selectedTimelineIndex = null,
  onTimelineSelect = null,
  hideTimelineStageGrid = false,
  hideTimelineSummary = false
}) {
  const [tooltip, setTooltip] = useState(null);
  const [pinnedTooltipKey, setPinnedTooltipKey] = useState(null);
  const [showRawTable, setShowRawTable] = useState(false);
  const [timelineFigureIndex, setTimelineFigureIndex] = useState(0);
  const rawTableId = useId();
  const tooltipHelpId = `${chart.slug}-tooltip-help`;
  const chartPointCount = Array.isArray(chart.data_points) ? chart.data_points.length : 0;
  const timelineIndexControlled = Number.isInteger(selectedTimelineIndex);

  const xKey = chart.chart_config?.x_key ?? inferDefaultXKey(chart);

  const series = useMemo(() => {
    if (chart.chart_config?.series?.length) {
      return chart.chart_config.series;
    }
    return defaultSeriesForChart(chart);
  }, [chart]);

  const unitBySeriesKey = useMemo(
    () => Object.fromEntries(series.map((item) => [item.key, item.unit ?? chart.units])),
    [chart.units, series]
  );

  const points = useMemo(
    () =>
      chart.data_points.map((point) => {
        const label = entryLabel(point, xKey);
        const values = Object.fromEntries(series.map((item) => [item.key, toNumeric(point[item.key])]));
        return { label, raw: point, values };
      }),
    [chart.data_points, series, xKey]
  );

  const leftSeries = series.filter((item) => item.axis === "left");
  const rightSeries = series.filter((item) => item.axis === "right");

  const leftMax = max(points, (point) => max(leftSeries, (item) => point.values[item.key]) ?? 0) ?? 0;
  const rightMax = rightSeries.length
    ? max(points, (point) => max(rightSeries, (item) => point.values[item.key]) ?? 0) ?? 0
    : 0;

  const yLeft = scaleLinear()
    .domain([0, leftMax > 0 ? leftMax : 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const yRight = scaleLinear()
    .domain([0, rightMax > 0 ? rightMax : 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const x = scaleBand()
    .domain(points.map((point) => point.label))
    .range([margin.left, width - margin.right])
    .padding(0.22);

  const getSeriesUnit = (seriesKey, row) => {
    if (row && typeof row.unit === "string" && seriesKey === "value") {
      return row.unit;
    }
    return unitBySeriesKey[seriesKey] ?? chart.units;
  };

  const formatSeriesValue = (seriesKey, value, row) => {
    return formatUnit(value, getSeriesUnit(seriesKey, row));
  };

  const useUnifiedDualAxisTooltip =
    chart.slug === "projects-funding-over-time" && leftSeries.length > 0 && rightSeries.length > 0;

  const fundingTooltipSeries =
    series.find((item) => /funding|grant|usd/i.test(`${item.key} ${item.label}`)) ?? leftSeries[0] ?? null;
  const projectsTooltipSeries =
    series.find((item) => /project/i.test(`${item.key} ${item.label}`)) ?? rightSeries[0] ?? null;

  const buildUnifiedDualAxisTooltip = (point, xPosition, yPosition) => {
    if (!useUnifiedDualAxisTooltip || !fundingTooltipSeries || !projectsTooltipSeries) {
      return null;
    }
    const fundingValue = point.values[fundingTooltipSeries.key];
    const projectsValue = point.values[projectsTooltipSeries.key];
    return {
      x: xPosition,
      y: yPosition,
      title: point.label,
      value: `Total funding: ${formatSeriesValue(fundingTooltipSeries.key, fundingValue, point.raw)} | Total projects: ${formatSeriesValue(projectsTooltipSeries.key, projectsValue, point.raw)}`
    };
  };

  const formatRawCell = (columnKey, value, row) => {
    if (typeof value !== "number") {
      return String(value);
    }

    const configured = chart.raw_table?.columns.find((column) => column.key === columnKey);
    if (configured?.unit) {
      return formatUnit(value, configured.unit);
    }

    if (series.some((item) => item.key === columnKey)) {
      return formatSeriesValue(columnKey, value, row);
    }

    if (columnKey === "value") {
      return formatSeriesValue("value", value, row);
    }

    return formatUnit(value, "");
  };

  const rawColumns = useMemo(() => {
    if (chart.raw_table?.columns?.length) {
      return chart.raw_table.columns;
    }

    const seen = new Set();
    chart.data_points.forEach((row) => {
      Object.keys(row).forEach((key) => seen.add(key));
    });

    return Array.from(seen).map((key) => ({
      key,
      label: prettyColumnLabel(key)
    }));
  }, [chart.data_points, chart.raw_table?.columns]);

  const provenanceSource = "Platform financial data";

  const leftAxisUnit =
    chart.chart_config?.y_left_unit ?? leftSeries[0]?.unit ?? (chart.chart_type === "paired_metric" ? "%" : chart.units);
  const rightAxisUnit = chart.chart_config?.y_right_unit ?? rightSeries[0]?.unit ?? chart.units;
  const renderLegend = series.length > 1;

  const revealTooltip = (key, payload, pin = false) => {
    setTooltip(payload);
    if (pin) {
      setPinnedTooltipKey(key);
    }
  };

  const dismissTooltip = (key) => {
    if (pinnedTooltipKey && pinnedTooltipKey !== key) {
      return;
    }
    setTooltip(null);
    if (pinnedTooltipKey === key) {
      setPinnedTooltipKey(null);
    }
  };

  const togglePinnedTooltip = (key, payload) => {
    if (pinnedTooltipKey === key) {
      setPinnedTooltipKey(null);
      setTooltip(null);
      return;
    }
    revealTooltip(key, payload, true);
  };

  const buildTooltipAriaLabel = (payload) => {
    if (!payload) {
      return "";
    }
    return payload.source
      ? `${payload.title}: ${payload.value}. Source: ${payload.source}`
      : `${payload.title}: ${payload.value}`;
  };

  const renderTooltipBox = (activeTooltip, style) => {
    if (!activeTooltip) {
      return null;
    }
    return (
      <div className="chart-tooltip" style={style}>
        <strong>{activeTooltip.title}</strong>
        <span>{activeTooltip.value}</span>
        {activeTooltip.source ? <small>{activeTooltip.source}</small> : null}
      </div>
    );
  };

  const renderRawTable = () => {
    if (!showRawTable) {
      return null;
    }

    return (
      <div className="chart-table-wrap" id={rawTableId}>
        <table className="chart-table">
          <thead>
            <tr>
              {rawColumns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data_points.map((row, index) => (
              <tr key={`${chart.slug}-row-${index}`}>
                {rawColumns.map((column) => {
                  const rawValue = row[column.key];
                  return (
                    <td key={`${index}-${column.key}`}>
                      {rawValue === undefined ? "-" : formatRawCell(column.key, rawValue, row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderShell = (body, a11yNote, legend = null) => {
    return (
      <article
        className={`panel financial-chart-panel${compact ? " financial-chart-panel--compact" : ""}`}
        aria-labelledby={`${chart.slug}-title`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinnedTooltipKey(null);
            setTooltip(null);
          }
        }}
      >
        <div className="chart-header-row">
          <h3 id={`${chart.slug}-title`}>{chart.title}</h3>
          <div className="chart-header-row__meta">
            {!compact ? (
              <button
                type="button"
                className="chart-toggle"
                onClick={() => setShowRawTable((value) => !value)}
                aria-expanded={showRawTable}
                aria-controls={rawTableId}
              >
                {showRawTable ? "Hide raw table" : "Show raw table"}
              </button>
            ) : null}
          </div>
        </div>

        {legend}
        {body}
        {!compact ? renderRawTable() : null}
        {a11yNote ? (
          <p id={tooltipHelpId} className="note chart-a11y-note">
            {a11yNote}
          </p>
        ) : null}
      </article>
    );
  };

  useEffect(() => {
    if (chart.chart_type !== "timeline" || timelineIndexControlled) {
      return;
    }
    setTimelineFigureIndex(Math.max(chartPointCount - 1, 0));
  }, [chart.chart_type, chart.slug, chartPointCount, timelineIndexControlled]);

  if (chart.chart_type === "timeline") {
    const timelineItems = chart.data_points.map((row, index) => ({
      period: row.period ?? row.year_range ?? row.year ?? `Stage ${index + 1}`,
      title: row.title ?? row.stage ?? row.label ?? "Milestone",
      headline: row.headline ?? row.summary ?? "",
      projects: Number.isFinite(row.projects) ? row.projects : null,
      funding: Number.isFinite(row.value) ? row.value : null
    }));
    const timelineSelectionIndex = timelineIndexControlled
      ? Number(selectedTimelineIndex)
      : timelineFigureIndex;
    const activeTimelineIndex =
      timelineItems.length > 0
        ? Math.min(Math.max(timelineSelectionIndex, 0), timelineItems.length - 1)
        : -1;
    const activeTimelineItem = activeTimelineIndex >= 0 ? timelineItems[activeTimelineIndex] : null;
    const activeTimelineBounds =
      activeTimelineIndex >= 0
        ? THREADS_REPORT_STAGE_BOUNDS[activeTimelineIndex] ?? [
            activeTimelineIndex / Math.max(timelineItems.length, 1),
            (activeTimelineIndex + 1) / Math.max(timelineItems.length, 1)
          ]
        : [0.45, 0.55];
    const activeTimelineCenter = Math.min(
      0.98,
      Math.max(0.02, (activeTimelineBounds[0] + activeTimelineBounds[1]) / 2)
    );
    const activeCallouts = activeTimelineItem
      ? THREADS_REPORT_CALLOUTS[String(activeTimelineItem.period).toLowerCase()] ??
        THREADS_REPORT_CALLOUTS[String(activeTimelineItem.period)] ??
        [activeTimelineItem.headline].filter(Boolean)
      : [];
    const timelineIntro = chart.chart_config?.timeline_intro ?? null;
    const timelineIntroTitle = cleanReportLanguage(
      timelineIntro?.title ?? chart.chart_config?.figure_title ?? chart.title
    );
    const timelineIntroParagraphs = Array.isArray(timelineIntro?.paragraphs)
      ? timelineIntro.paragraphs
          .map((paragraph) => cleanReportLanguage(paragraph))
          .filter((paragraph) => paragraph.length > 0)
      : [];
    const timelineIntroParts = timelineIntroTitle
      ? timelineIntroTitle
          .split(":")
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
    const timelineIntroKicker = timelineIntroParts.length > 1 ? timelineIntroParts[0] : "";
    const timelineIntroHeading = timelineIntroParts.length > 1
      ? timelineIntroParts.slice(1).join(": ")
      : timelineIntroTitle;
    const timelineIntroColumnOne = timelineIntroParagraphs[0] ?? "";
    const timelineIntroColumnTwo = timelineIntroParagraphs.length > 1
      ? timelineIntroParagraphs.slice(1).join(" ")
      : "";
    const handleTimelineSelect = (index) => {
      if (!timelineIndexControlled) {
        setTimelineFigureIndex(index);
      }
      if (typeof onTimelineSelect === "function") {
        onTimelineSelect(index);
      }
    };

    return renderShell(
      <div
        className="chart-wrap chart-wrap--timeline chart-wrap--threads-report"
        style={{ "--threads-active-center": `${activeTimelineCenter * 100}%` }}
      >
        <figure className="threads-report-figure">
          {timelineIntroHeading || timelineIntroColumnOne || timelineIntroColumnTwo ? (
            <header className="threads-report-figure__intro">
              <div className="threads-report-figure__intro-head">
                {timelineIntroKicker ? <p>{timelineIntroKicker}</p> : null}
                {timelineIntroHeading ? <h4>{timelineIntroHeading}</h4> : null}
              </div>
              {timelineIntroColumnOne ? (
                <p className="threads-report-figure__intro-paragraph">{timelineIntroColumnOne}</p>
              ) : (
                <div />
              )}
              {timelineIntroColumnTwo ? (
                <p className="threads-report-figure__intro-paragraph">{timelineIntroColumnTwo}</p>
              ) : (
                <div />
              )}
            </header>
          ) : null}
          <div className="threads-report-figure__canvas">
            <img
              src={mediaPath("report-page-22.jpg")}
              alt="Threads timeline visual showing growth stages and milestones."
            />
            <div className="threads-report-figure__overlay" role="tablist" aria-label="Timeline stages">
              {timelineItems.map((item, index) => {
                const fallbackStart = index / Math.max(timelineItems.length, 1);
                const fallbackEnd = (index + 1) / Math.max(timelineItems.length, 1);
                const [leftRatio, rightRatio] = THREADS_REPORT_STAGE_BOUNDS[index] ?? [
                  fallbackStart,
                  fallbackEnd
                ];
                const isActive = index === activeTimelineIndex;
                return (
                  <button
                    key={`${item.period}-${item.title}`}
                    type="button"
                    className={`threads-report-stage-hotspot${isActive ? " is-active" : ""}`}
                    style={{
                      left: `${leftRatio * 100}%`,
                      width: `${Math.max((rightRatio - leftRatio) * 100, 4)}%`
                    }}
                    aria-selected={isActive}
                    aria-label={`${item.period}: ${item.title}`}
                    onClick={() => handleTimelineSelect(index)}
                  >
                    <span className="sr-only">
                      {item.period} {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </figure>

        {!hideTimelineSummary && activeTimelineItem ? (
          <article className="threads-report-stage">
            <header className="threads-report-stage__head">
              <p>{activeTimelineItem.period}</p>
              <h4>{activeTimelineItem.title}</h4>
            </header>
            {activeTimelineItem.headline ? <p className="threads-report-stage__headline">{activeTimelineItem.headline}</p> : null}
            <div className="threads-report-stage__metrics">
              {activeTimelineItem.projects !== null ? (
                <span>{formatUnit(activeTimelineItem.projects, "projects")} active</span>
              ) : null}
              {activeTimelineItem.funding !== null ? (
                <span>{formatUnit(activeTimelineItem.funding, "USD")} grants</span>
              ) : null}
            </div>
            <ul className="threads-report-stage__callouts">
              {activeCallouts.map((callout) => (
                <li key={callout}>{callout}</li>
              ))}
            </ul>
          </article>
        ) : null}

        {compact || hideTimelineStageGrid ? null : (
          <div className="threads-report-stage-grid" role="list" aria-label="Timeline stage summary">
            {timelineItems.map((item, index) => {
              const isActive = index === activeTimelineIndex;
              return (
                <button
                  key={`${item.period}-${item.title}-chip`}
                  type="button"
                  className={`threads-report-stage-grid__item${isActive ? " is-active" : ""}`}
                  onClick={() => handleTimelineSelect(index)}
                >
                  <p>{item.period}</p>
                  <strong>{item.title}</strong>
                </button>
              );
            })}
          </div>
        )}
      </div>,
      ""
    );
  }

  if (chart.chart_type === "bubble") {
    const bubbleWidth = 860;
    const bubbleHeight = 320;
    const bubbles = chart.data_points.map((point, index) => ({
      key: point.label ?? `point-${index}`,
      label: point.label ?? `Value ${index + 1}`,
      value: toNumeric(point.value),
      color: point.color ?? ["#128c7e", "#d05c49", "#0b4f63"][index % 3]
    }));
    const maxValue = max(bubbles, (bubble) => bubble.value) ?? 1;
    const radiusScale = scaleLinear().domain([0, maxValue]).range([34, 92]);
    const spacing = bubbles.length > 1 ? (bubbleWidth - 200) / (bubbles.length - 1) : 0;

    return renderShell(
      <div className="chart-wrap chart-wrap--bubble">
        <svg viewBox={`0 0 ${bubbleWidth} ${bubbleHeight}`} role="img" aria-labelledby={`${chart.slug}-title ${tooltipHelpId}`}>
          <line x1="100" y1="175" x2={bubbleWidth - 100} y2="175" stroke="rgba(20,58,52,0.25)" strokeWidth="2" />
          {bubbles.map((bubble, index) => {
            const xPos = 100 + spacing * index;
            const radius = radiusScale(bubble.value);
            const key = `${bubble.label}-${index}`;
            const payload = {
              x: xPos,
              y: 175 - radius,
              title: bubble.label,
              value: formatUnit(bubble.value, chart.units),
              source: provenanceSource
            };
            return (
              <g key={key}>
                <circle
                  cx={xPos}
                  cy={175}
                  r={radius}
                  fill={bubble.color}
                  fillOpacity={0.9}
                  stroke="rgba(246,237,220,0.92)"
                  strokeWidth="2"
                  tabIndex={0}
                  role="button"
                  aria-label={buildTooltipAriaLabel(payload)}
                  onFocus={() => revealTooltip(key, payload)}
                  onBlur={() => dismissTooltip(key)}
                  onMouseEnter={() => revealTooltip(key, payload)}
                  onMouseLeave={() => dismissTooltip(key)}
                  onClick={() => togglePinnedTooltip(key, payload)}
                />
                <text x={xPos} y={167} textAnchor="middle" fontSize="12" fill="#f4f1ea" fontWeight="700">
                  {bubble.label}
                </text>
                <text x={xPos} y={184} textAnchor="middle" fontSize="11" fill="#f4f1ea">
                  {formatUnit(bubble.value, chart.units)}
                </text>
              </g>
            );
          })}
        </svg>
        {renderTooltipBox(tooltip, {
          left: `${((tooltip?.x ?? 0) / bubbleWidth) * 100}%`,
          top: `${((tooltip?.y ?? 0) / bubbleHeight) * 100}%`
        })}
      </div>,
      "Bubble sizes represent relative scale across categories."
    );
  }

  if (chart.chart_type === "pie") {
    const totalRow =
      chart.data_points.find((point) => point.role === "total") ??
      chart.data_points.find((point) => String(point.label).toLowerCase().includes("total"));
    const segments = chart.data_points.filter((point) => point !== totalRow);
    const totalValue = totalRow ? toNumeric(totalRow.value) : segments.reduce((sum, point) => sum + toNumeric(point.value), 0);
    const palette = ["#cb5946", "#054b5f", "#10877a", "#d99f52"];
    const pieData = segments.map((segment, index) => ({
      ...segment,
      value: toNumeric(segment.value),
      color: segment.color ?? palette[index % palette.length]
    }));

    const pieWidth = 520;
    const pieHeight = 300;
    const centerX = 190;
    const centerY = 150;
    const outerRadius = 120;
    const pieLayout = d3Pie().sort(null).value((item) => item.value);
    const arcs = pieLayout(pieData);
    const arcPath = d3Arc().innerRadius(0).outerRadius(outerRadius);

    return renderShell(
      <div className="chart-wrap chart-wrap--pie">
        <div className="pie-chart-layout">
          <div className="pie-chart-svg-wrap">
            <svg
              viewBox={`0 0 ${pieWidth} ${pieHeight}`}
              className="pie-chart-svg"
              role="img"
              aria-labelledby={`${chart.slug}-title ${tooltipHelpId}`}
            >
              <g transform={`translate(${centerX} ${centerY})`}>
                {arcs.map((slice, index) => {
                  const segment = pieData[index];
                  const centroid = arcPath.centroid(slice);
                  const percentage = totalValue > 0 ? Math.round((segment.value / totalValue) * 100) : 0;
                  const key = `${segment.label}-${index}`;
                  const payload = {
                    x: centerX + centroid[0],
                    y: centerY + centroid[1],
                    title: segment.label,
                    value: `${formatUnit(segment.value, chart.units)} (${percentage}%)`,
                    source: provenanceSource
                  };

                  return (
                    <g key={key}>
                      <path
                        d={arcPath(slice) ?? undefined}
                        fill={segment.color}
                        stroke="rgba(246,235,214,0.92)"
                        strokeWidth="2"
                        tabIndex={0}
                        role="button"
                        aria-label={buildTooltipAriaLabel(payload)}
                        onFocus={() => revealTooltip(key, payload)}
                        onBlur={() => dismissTooltip(key)}
                        onMouseEnter={() => revealTooltip(key, payload)}
                        onMouseLeave={() => dismissTooltip(key)}
                        onClick={() => togglePinnedTooltip(key, payload)}
                      />
                      {percentage >= 8 ? (
                        <text x={centroid[0]} y={centroid[1] + 4} textAnchor="middle" fill="#fff7eb" fontSize="13" fontWeight="700">
                          {percentage}%
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
            {renderTooltipBox(tooltip, {
              left: `${((tooltip?.x ?? 0) / pieWidth) * 100}%`,
              top: `${((tooltip?.y ?? 0) / pieHeight) * 100}%`
            })}
          </div>
          <div className="pie-chart-aside">
            {totalRow ? (
              <p className="pie-chart-total">
                <strong>Total:</strong> {formatUnit(totalValue, chart.units)}
              </p>
            ) : null}
            <ul>
              {pieData.map((segment) => {
                const percentage = totalValue > 0 ? Math.round((segment.value / totalValue) * 100) : 0;
                return (
                  <li key={segment.label}>
                    <span className="chart-legend__item">
                      <i className="chart-legend__swatch" style={{ background: segment.color }} aria-hidden="true" />
                      {segment.label}
                    </span>
                    <span>{formatUnit(segment.value, chart.units)} ({percentage}%)</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>,
      "Pie segment labels and values show the commitment split across funding sources."
    );
  }

  if (chart.chart_type === "funding_flow") {
    const disbursementTotal = findValueByLabel(chart.data_points, "Disbursements");
    const breakdown =
      chart.chart_config?.disbursement_breakdown ?? [
        { label: "Indigenous Peoples (IP) Organisations", percent: 53, color: "#0d8587" },
        { label: "NGOs & Other Organisations", percent: 22, color: "#04515d" },
        { label: "Local Community (LC) Organisations", percent: 16, color: "#0d9177" },
        { label: "Afro-descendant Peoples (ADP) Organisations", percent: 9, color: "#ce634f" }
      ];
    const pieData = breakdown.map((segment) => ({
      ...segment,
      value: Math.round((disbursementTotal * segment.percent) / 100)
    }));

    const pieWidth = 340;
    const pieHeight = 230;
    const centerX = 150;
    const centerY = 116;
    const outerRadius = 92;
    const pieLayout = d3Pie().sort(null).value((item) => item.percent);
    const arcs = pieLayout(pieData);
    const arcPath = d3Arc().innerRadius(0).outerRadius(outerRadius);
    const labelPath = d3Arc().innerRadius(54).outerRadius(54);

    const flowValues = {
      totalIncome: findValueByLabel(chart.data_points, "Total income"),
      government: findValueByLabel(chart.data_points, "Government donors"),
      philanthropic: findValueByLabel(chart.data_points, "Philanthropic donors"),
      overhead: findValueByLabel(chart.data_points, "Overhead"),
      projectSupport: findValueByLabel(chart.data_points, "Project support"),
      disbursements: disbursementTotal
    };

    return renderShell(
      <div className="chart-wrap chart-wrap--funding-flow">
        <div className="funding-flow-top">
          <div>
            <h4>2024 Funding Disbursements</h4>
            <p className="funding-flow-total">{formatUnit(disbursementTotal, "USD")} USD</p>
          </div>
          <div className="funding-flow-pie-row">
            <div className="funding-flow-pie-wrap">
              <svg
                viewBox={`0 0 ${pieWidth} ${pieHeight}`}
                className="funding-flow-pie"
                role="img"
                aria-labelledby={`${chart.slug}-title ${tooltipHelpId}`}
              >
                <g transform={`translate(${centerX} ${centerY})`}>
                  {arcs.map((slice, index) => {
                    const segment = pieData[index];
                    const [lx, ly] = labelPath.centroid(slice);
                    const key = `${segment.label}-${index}`;
                    const payload = {
                      x: centerX + lx,
                      y: centerY + ly,
                      title: segment.label,
                      value: `${segment.percent}% (${formatUnit(segment.value, "USD")})`,
                      source: provenanceSource
                    };

                    return (
                      <g key={key}>
                        <path
                          d={arcPath(slice) ?? undefined}
                          fill={segment.color}
                          stroke="rgba(246,235,214,0.92)"
                          strokeWidth="2"
                          tabIndex={0}
                          role="button"
                          aria-label={buildTooltipAriaLabel(payload)}
                          onFocus={() => revealTooltip(key, payload)}
                          onBlur={() => dismissTooltip(key)}
                          onMouseEnter={() => revealTooltip(key, payload)}
                          onMouseLeave={() => dismissTooltip(key)}
                          onClick={() => togglePinnedTooltip(key, payload)}
                        />
                        <text x={lx} y={ly + 4} textAnchor="middle" fill="#fff5e8" fontSize="12" fontWeight="700">
                          {segment.percent}%
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
              {renderTooltipBox(tooltip, {
                left: `${((tooltip?.x ?? 0) / pieWidth) * 100}%`,
                top: `${((tooltip?.y ?? 0) / pieHeight) * 100}%`
              })}
            </div>
            <ul className="funding-flow-breakdown">
              {pieData.map((segment) => (
                <li key={segment.label}>
                  <span className="chart-legend__item">
                    <i className="chart-legend__swatch" style={{ background: segment.color }} aria-hidden="true" />
                    {segment.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="funding-flow-schematic">
          <article className="flow-card flow-card--accent">
            <h5>Total income</h5>
            <p>{formatUnit(flowValues.totalIncome, "USD")}</p>
          </article>
          <div className="flow-arrow" aria-hidden="true">→</div>

          <div className="flow-column">
            <article className="flow-card">
              <h5>Government donors</h5>
              <p>{formatUnit(flowValues.government, "USD")}</p>
            </article>
            <article className="flow-card">
              <h5>Philanthropic donors</h5>
              <p>{formatUnit(flowValues.philanthropic, "USD")}</p>
            </article>
          </div>

          <div className="flow-node" aria-hidden="true">●</div>
          <div className="flow-arrow" aria-hidden="true">→</div>

          <div className="flow-column">
            <article className="flow-card">
              <h5>Overhead</h5>
              <p>{formatUnit(flowValues.overhead, "USD")}</p>
            </article>
            <article className="flow-card">
              <h5>Project support</h5>
              <p>{formatUnit(flowValues.projectSupport, "USD")}</p>
            </article>
            <article className="flow-card flow-card--accent">
              <h5>Disbursements</h5>
              <p>{formatUnit(flowValues.disbursements, "USD")}</p>
            </article>
          </div>
        </div>
      </div>,
      "Pie shares and funding-flow boxes show allocation and movement of funds. Hover or focus pie segments for values."
    );
  }

  if (chart.chart_type === "metric_cards") {
    return renderShell(
      <div className="chart-wrap chart-wrap--metrics">
        <div className="metric-card-grid">
          {chart.data_points.map((point, index) => {
            const value = toNumeric(point.value);
            const unit = point.unit ?? chart.units;
            return (
              <article className="metric-card" key={`${point.label}-${index}`}>
                <p>{point.label}</p>
                <strong>{formatUnit(value, unit)}</strong>
              </article>
            );
          })}
        </div>
      </div>,
      "Metric cards surface non-axis indicators in a concise format."
    );
  }

  if (chart.chart_type === "paired_metric") {
    const rows = chart.data_points.map((row, index) => {
      const currentValue = toNumeric(row.value_2024 ?? row.current_value ?? row.value);
      const growthPct = toNumeric(row.growth_pct ?? row.value);
      let priorValue = toNumeric(row.value_2023 ?? row.baseline_value);

      if (priorValue <= 0 && currentValue > 0 && growthPct > 0) {
        priorValue = currentValue / (1 + growthPct / 100);
      }

      return {
        key: row.metric ?? row.label ?? `Metric ${index + 1}`,
        label: row.metric ?? row.label ?? `Metric ${index + 1}`,
        value2023: priorValue,
        value2024: currentValue,
        growthPct,
        unit: row.unit ?? chart.units
      };
    });

    const pairedWidth = 860;
    const pairedHeight = 320;
    const pairedMargin = { top: 26, right: 28, bottom: 74, left: 78 };
    const groupedX = scaleBand()
      .domain(rows.map((row) => row.label))
      .range([pairedMargin.left, pairedWidth - pairedMargin.right])
      .padding(0.26);
    const barX = scaleBand().domain(["2023", "2024"]).range([0, groupedX.bandwidth()]).padding(0.12);
    const pairedMax = max(rows, (row) => Math.max(row.value2023, row.value2024)) ?? 1;
    const pairedY = scaleLinear().domain([0, pairedMax > 0 ? pairedMax : 1]).nice().range([pairedHeight - pairedMargin.bottom, pairedMargin.top]);

    const colors = { "2023": "#044a5a", "2024": "#118c8f" };

    return renderShell(
      <div className="chart-wrap chart-wrap--paired">
        <svg viewBox={`0 0 ${pairedWidth} ${pairedHeight}`} role="img" aria-labelledby={`${chart.slug}-title ${tooltipHelpId}`}>
          <line
            x1={pairedMargin.left}
            y1={pairedHeight - pairedMargin.bottom}
            x2={pairedWidth - pairedMargin.right}
            y2={pairedHeight - pairedMargin.bottom}
            stroke="rgba(21,57,50,0.34)"
          />

          {pairedY.ticks(4).map((tick) => (
            <g key={`paired-tick-${tick}`}>
              <line
                x1={pairedMargin.left}
                x2={pairedWidth - pairedMargin.right}
                y1={pairedY(tick)}
                y2={pairedY(tick)}
                stroke="rgba(20,58,52,0.09)"
              />
              <text x={pairedMargin.left - 10} y={pairedY(tick) + 4} textAnchor="end" fontSize="10" fill="#3e5f57">
                {formatUnit(tick, rows[0]?.unit ?? chart.units)}
              </text>
            </g>
          ))}

          {rows.map((row) => {
            const xGroup = groupedX(row.label);
            if (xGroup == null) {
              return null;
            }

            return (
              <g key={row.key}>
                {["2023", "2024"].map((yearKey) => {
                  const value = yearKey === "2023" ? row.value2023 : row.value2024;
                  const yPos = pairedY(value);
                  const xPos = xGroup + (barX(yearKey) ?? 0);
                  const widthBar = Math.max((barX.bandwidth() ?? 0) - 2, 4);
                  const key = `${row.key}-${yearKey}`;
                  const payload = {
                    x: xPos + widthBar / 2,
                    y: yPos,
                    title: `${row.label} (${yearKey})`,
                    value: formatUnit(value, row.unit)
                  };

                  return (
                    <rect
                      key={key}
                      x={xPos}
                      y={yPos}
                      width={widthBar}
                      height={pairedHeight - pairedMargin.bottom - yPos}
                      fill={colors[yearKey]}
                      tabIndex={0}
                      role="button"
                      aria-label={buildTooltipAriaLabel(payload)}
                      onFocus={() => revealTooltip(key, payload)}
                      onBlur={() => dismissTooltip(key)}
                      onMouseEnter={() => revealTooltip(key, payload)}
                      onMouseLeave={() => dismissTooltip(key)}
                      onClick={() => togglePinnedTooltip(key, payload)}
                    />
                  );
                })}

                <text
                  x={xGroup + groupedX.bandwidth() / 2}
                  y={pairedHeight - pairedMargin.bottom + 30}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#254943"
                >
                  {row.label}
                </text>

                <text
                  x={xGroup + groupedX.bandwidth() / 2}
                  y={pairedY(Math.max(row.value2023, row.value2024)) - 8}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#0f7f73"
                  fontWeight="700"
                >
                  {`${Math.round(row.growthPct)}%`}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="chart-legend">
          <span className="chart-legend__item">
            <i className="chart-legend__swatch" style={{ background: colors["2023"] }} aria-hidden="true" />
            2023
          </span>
          <span className="chart-legend__item">
            <i className="chart-legend__swatch" style={{ background: colors["2024"] }} aria-hidden="true" />
            2024
          </span>
        </div>

        {renderTooltipBox(tooltip, {
          left: `${((tooltip?.x ?? 0) / pairedWidth) * 100}%`,
          top: `${((tooltip?.y ?? 0) / pairedHeight) * 100}%`
        })}
      </div>,
      "Grouped 2023/2024 bars and growth labels show period-over-period change."
    );
  }

  const isStacked = chart.chart_type === "stacked_bar" || chart.chart_config?.stacked === true;
  const detailedLegend = isStacked || chart.slug === "impact-growth-2023-2024";
  const defaultLegend = renderLegend ? (
    <div className={`chart-legend${detailedLegend ? " chart-legend--detailed" : ""}`}>
      {series.map((item) => (
        <span
          key={item.key}
          className={`chart-legend__item${detailedLegend ? " chart-legend__item--detailed" : ""}`}
        >
          <i className="chart-legend__swatch" style={{ background: item.color }} aria-hidden="true" />
          <span>{item.label}</span>
          {detailedLegend ? <em>{item.unit ?? chart.units}</em> : null}
        </span>
      ))}
    </div>
  ) : null;

  return renderShell(
    <div className="chart-wrap chart-svg-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${chart.slug}-title ${tooltipHelpId}`}
      >
        <line
          x1={margin.left}
          y1={height - margin.bottom}
          x2={width - margin.right}
          y2={height - margin.bottom}
          stroke="rgba(21,57,50,0.34)"
        />
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={height - margin.bottom}
          stroke="rgba(21,57,50,0.34)"
        />

        {yLeft.ticks(5).map((tick) => (
          <g key={`left-${tick}`}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={yLeft(tick)}
              y2={yLeft(tick)}
              stroke="rgba(20,58,52,0.08)"
            />
            <text x={margin.left - 10} y={yLeft(tick) + 4} textAnchor="end" fontSize="10" fill="#3e5f57">
              {formatUnit(tick, leftAxisUnit)}
            </text>
          </g>
        ))}

        {rightSeries.length
          ? yRight.ticks(5).map((tick) => (
              <text
                key={`right-${tick}`}
                x={width - margin.right + 8}
                y={yRight(tick) + 4}
                textAnchor="start"
                fontSize="10"
                fill="#5f5550"
              >
                {formatUnit(tick, rightAxisUnit)}
              </text>
            ))
          : null}

        {points.map((point) => {
          const baseX = x(point.label);
          if (baseX == null) {
            return null;
          }

          const barSeries = series.filter((item) => item.type === "bar");
          const lineSeries = series.filter((item) => item.type === "line");
          const barWidth = barSeries.length > 0 ? x.bandwidth() / barSeries.length : x.bandwidth();

          return (
            <g key={point.label}>
              {barSeries.map((item, index) => {
                const rawValue = point.values[item.key];
                const axisScale = item.axis === "right" ? yRight : yLeft;
                const stackedBase = isStacked
                  ? barSeries
                      .slice(0, index)
                      .reduce((sum, prior) => sum + point.values[prior.key], 0)
                  : 0;
                const yTop = axisScale(rawValue + stackedBase);
                const yBottom = axisScale(stackedBase);
                const key = `${point.label}-${item.key}`;
                const payload = {
                  x: baseX + index * barWidth + barWidth / 2,
                  y: yTop,
                  title: `${point.label} - ${item.label}`,
                  value: formatSeriesValue(item.key, rawValue, point.raw)
                };
                const tooltipPayload =
                  buildUnifiedDualAxisTooltip(point, payload.x, payload.y) ?? payload;

                return (
                  <rect
                    key={key}
                    x={isStacked ? baseX : baseX + index * barWidth}
                    y={yTop}
                    width={Math.max((isStacked ? x.bandwidth() : barWidth) - 2, 2)}
                    height={Math.max(1, yBottom - yTop)}
                    fill={item.color}
                    opacity={0.88}
                    tabIndex={0}
                    role="button"
                    aria-label={buildTooltipAriaLabel(tooltipPayload)}
                    onFocus={() => revealTooltip(key, tooltipPayload)}
                    onBlur={() => dismissTooltip(key)}
                    onMouseEnter={() => revealTooltip(key, tooltipPayload)}
                    onMouseLeave={() => dismissTooltip(key)}
                    onClick={() => togglePinnedTooltip(key, tooltipPayload)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePinnedTooltip(key, tooltipPayload);
                      }
                    }}
                  />
                );
              })}

              {lineSeries.map((item) => {
                const value = point.values[item.key];
                const axisScale = item.axis === "right" ? yRight : yLeft;
                const cx = baseX + x.bandwidth() / 2;
                const cy = axisScale(value);
                const key = `${point.label}-${item.key}`;
                const payload = {
                  x: cx,
                  y: cy,
                  title: `${point.label} - ${item.label}`,
                  value: formatSeriesValue(item.key, value, point.raw)
                };
                const tooltipPayload =
                  buildUnifiedDualAxisTooltip(point, payload.x, payload.y) ?? payload;

                return (
                  <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={item.color}
                    stroke="#fff7eb"
                    strokeWidth={1.5}
                    tabIndex={0}
                    role="button"
                    aria-label={buildTooltipAriaLabel(tooltipPayload)}
                    onFocus={() => revealTooltip(key, tooltipPayload)}
                    onBlur={() => dismissTooltip(key)}
                    onMouseEnter={() => revealTooltip(key, tooltipPayload)}
                    onMouseLeave={() => dismissTooltip(key)}
                    onClick={() => togglePinnedTooltip(key, tooltipPayload)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePinnedTooltip(key, tooltipPayload);
                      }
                    }}
                  />
                );
              })}
            </g>
          );
        })}

        {series
          .filter((item) => item.type === "line")
          .map((item) => {
            const axisScale = item.axis === "right" ? yRight : yLeft;
            const linePath = d3Line()
              .x((point) => {
                const bandX = x(point.label);
                return (bandX ?? margin.left) + x.bandwidth() / 2;
              })
              .y((point) => axisScale(point.values[item.key]))
              .curve(curveMonotoneX);

            return (
              <path
                key={`line-${item.key}`}
                d={linePath(points) ?? undefined}
                fill="none"
                stroke={item.color}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            );
          })}

        {points.map((point) => {
          const xValue = x(point.label);
          if (xValue == null) {
            return null;
          }
          return (
            <text
              key={`tick-${point.label}`}
              x={xValue + x.bandwidth() / 2}
              y={height - margin.bottom + 24}
              textAnchor="middle"
              fontSize="10"
              fill="#254943"
            >
              {point.label}
            </text>
          );
        })}
      </svg>

      {renderTooltipBox(tooltip, {
        left: `${((tooltip?.x ?? 0) / width) * 100}%`,
        top: `${((tooltip?.y ?? 0) / height) * 100}%`
      })}
    </div>,
    "Hover, focus, or click chart marks to inspect values. Press Enter or Space to pin tooltips; Escape clears.",
    defaultLegend
  );
}
