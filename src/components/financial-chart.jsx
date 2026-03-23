import { useId, useMemo, useState } from "react";
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

export function FinancialChart({ chart, compact = false }) {
  const [tooltip, setTooltip] = useState(null);
  const [pinnedTooltipKey, setPinnedTooltipKey] = useState(null);
  const [showRawTable, setShowRawTable] = useState(false);
  const rawTableId = useId();
  const tooltipHelpId = `${chart.slug}-tooltip-help`;

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
        <p id={tooltipHelpId} className="note chart-a11y-note">
          {a11yNote}
        </p>
      </article>
    );
  };

  if (chart.chart_type === "timeline") {
    const timelineItems = chart.data_points.map((row, index) => ({
      period: row.period ?? row.year_range ?? row.year ?? `Stage ${index + 1}`,
      title: row.title ?? row.stage ?? row.label ?? "Milestone",
      headline: row.headline ?? row.summary ?? "",
      projects: Number.isFinite(row.projects) ? row.projects : null,
      funding: Number.isFinite(row.value) ? row.value : null
    }));

    const timelineWidth = 1040;
    const timelineHeight = 220;
    const leftPad = 38;
    const rightPad = 36;
    const stageCenters = timelineItems.map((_, index) => {
      if (timelineItems.length <= 1) {
        return timelineWidth / 2;
      }
      return leftPad + (index * (timelineWidth - leftPad - rightPad)) / (timelineItems.length - 1);
    });
    const boundaries = stageCenters
      .slice(0, -1)
      .map((xValue, index) => (xValue + stageCenters[index + 1]) / 2);

    const anchorIndex = Math.min(2, Math.max(timelineItems.length - 1, 0));
    const anchorX = stageCenters[anchorIndex] ?? timelineWidth / 2;
    const anchorY = 108;
    const rightEdge = timelineWidth - rightPad;
    const leftEdge = leftPad;

    const threadBands = [
      { count: 14, color: "#d8a153", targetY: 54, spread: 36, lift: -16 },
      { count: 12, color: "#c95e4a", targetY: 88, spread: 28, lift: -6 },
      { count: 10, color: "#12908c", targetY: 114, spread: 24, lift: 8 },
      { count: 10, color: "#0a4f63", targetY: 152, spread: 30, lift: 18 }
    ];

    const rightThreads = threadBands.flatMap((band, bandIndex) =>
      Array.from({ length: band.count }).map((_, index) => {
        const ratio = band.count <= 1 ? 0.5 : index / (band.count - 1);
        const spread = ratio - 0.5;
        const startY = anchorY + spread * 18;
        const endY = band.targetY + spread * band.spread;
        const controlX1 = anchorX + 84 + bandIndex * 16;
        const controlY1 = startY + band.lift;
        const controlX2 = rightEdge - 260 + bandIndex * 18;
        const controlY2 = endY - band.lift * 0.4;
        return {
          key: `thread-right-${bandIndex}-${index}`,
          path: `M ${anchorX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${rightEdge} ${endY}`,
          color: band.color
        };
      })
    );

    const leftThreads = Array.from({ length: 10 }).map((_, index) => {
      const ratio = 10 <= 1 ? 0.5 : index / (10 - 1);
      const spread = ratio - 0.5;
      const startY = 112 + spread * 28;
      const endY = anchorY + spread * 16;
      return {
        key: `thread-left-${index}`,
        path: `M ${leftEdge} ${startY} C ${leftEdge + 120} ${startY}, ${anchorX - 120} ${endY}, ${anchorX} ${endY}`,
        color: index % 2 === 0 ? "#1a8e8a" : "#c95e4a"
      };
    });

    return renderShell(
      <div className="chart-wrap chart-wrap--timeline">
        <div className="timeline-thread-strip" aria-hidden="true" />
        <div className="timeline-tapestry">
          <div className="timeline-stage-grid timeline-stage-grid--tapestry">
            {timelineItems.map((item) => (
              <article className="timeline-stage-card" key={`${item.period}-${item.title}`}>
                <p className="timeline-stage-card__period">{item.period}</p>
                <h4>{item.title}</h4>
                {item.headline ? <p>{item.headline}</p> : null}
                <div className="timeline-stage-card__meta">
                  {item.projects !== null ? <span>{item.projects} projects</span> : null}
                  {item.funding !== null ? <span>{formatUnit(item.funding, "USD")}</span> : null}
                </div>
              </article>
            ))}
          </div>

          <div className="timeline-tapestry__threads" aria-hidden="true">
            <svg viewBox={`0 0 ${timelineWidth} ${timelineHeight}`} role="presentation">
              {boundaries.map((xValue, index) => (
                <line
                  key={`timeline-boundary-${index}`}
                  x1={xValue}
                  x2={xValue}
                  y1={12}
                  y2={timelineHeight - 10}
                  stroke="rgba(20, 58, 52, 0.16)"
                  strokeWidth="1"
                />
              ))}

              {leftThreads.map((thread) => (
                <path
                  key={thread.key}
                  d={thread.path}
                  fill="none"
                  stroke={thread.color}
                  strokeOpacity="0.42"
                  strokeWidth="1.5"
                />
              ))}

              {rightThreads.map((thread) => (
                <path
                  key={thread.key}
                  d={thread.path}
                  fill="none"
                  stroke={thread.color}
                  strokeOpacity="0.45"
                  strokeWidth="1.25"
                />
              ))}

              <circle cx={anchorX} cy={anchorY} r="10" fill="rgba(11, 79, 99, 0.24)" stroke="#0b4f63" strokeWidth="2" />
              <circle cx={anchorX} cy={anchorY} r="4.5" fill="#f7e9cf" />
            </svg>
          </div>
        </div>
      </div>,
      "Timeline stages summarize funding and project growth milestones across each phase."
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
                  aria-label={`${payload.title}: ${payload.value}. Source: ${payload.source}`}
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
        {tooltip ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${(tooltip.x / bubbleWidth) * 100}%`,
              top: `${(tooltip.y / bubbleHeight) * 100}%`
            }}
          >
            <strong>{tooltip.title}</strong>
            <span>{tooltip.value}</span>
            <small>{tooltip.source}</small>
          </div>
        ) : null}
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
                      aria-label={`${payload.title}: ${payload.value}. Source: ${payload.source}`}
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

        {tooltip ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${(tooltip.x / pieWidth) * 100}%`,
              top: `${(tooltip.y / pieHeight) * 100}%`
            }}
          >
            <strong>{tooltip.title}</strong>
            <span>{tooltip.value}</span>
            <small>{tooltip.source}</small>
          </div>
        ) : null}
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
                        aria-label={`${payload.title}: ${payload.value}. Source: ${payload.source}`}
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

        {tooltip ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${(tooltip.x / pieWidth) * 100}%`,
              top: `${(tooltip.y / pieHeight) * 100}%`
            }}
          >
            <strong>{tooltip.title}</strong>
            <span>{tooltip.value}</span>
            <small>{tooltip.source}</small>
          </div>
        ) : null}
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
                    value: formatUnit(value, row.unit),
                    source: provenanceSource
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
                      aria-label={`${payload.title}: ${payload.value}. Source: ${payload.source}`}
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

        {tooltip ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${(tooltip.x / pairedWidth) * 100}%`,
              top: `${(tooltip.y / pairedHeight) * 100}%`
            }}
          >
            <strong>{tooltip.title}</strong>
            <span>{tooltip.value}</span>
            <small>{tooltip.source}</small>
          </div>
        ) : null}
      </div>,
      "Grouped 2023/2024 bars and growth labels show period-over-period change."
    );
  }

  const defaultLegend = renderLegend ? (
    <div className="chart-legend">
      {series.map((item) => (
        <span key={item.key} className="chart-legend__item">
          <i className="chart-legend__swatch" style={{ background: item.color }} aria-hidden="true" /> {item.label}
        </span>
      ))}
    </div>
  ) : null;

  const isStacked = chart.chart_type === "stacked_bar" || chart.chart_config?.stacked === true;

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
                  value: formatSeriesValue(item.key, rawValue, point.raw),
                  source: provenanceSource
                };

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
                    aria-label={`${payload.title}: ${payload.value}. Source: ${payload.source}`}
                    onFocus={() => revealTooltip(key, payload)}
                    onBlur={() => dismissTooltip(key)}
                    onMouseEnter={() => revealTooltip(key, payload)}
                    onMouseLeave={() => dismissTooltip(key)}
                    onClick={() => togglePinnedTooltip(key, payload)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePinnedTooltip(key, payload);
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
                  value: formatSeriesValue(item.key, value, point.raw),
                  source: provenanceSource
                };

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
                    aria-label={`${payload.title}: ${payload.value}. Source: ${payload.source}`}
                    onFocus={() => revealTooltip(key, payload)}
                    onBlur={() => dismissTooltip(key)}
                    onMouseEnter={() => revealTooltip(key, payload)}
                    onMouseLeave={() => dismissTooltip(key)}
                    onClick={() => togglePinnedTooltip(key, payload)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePinnedTooltip(key, payload);
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

      {tooltip ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${(tooltip.x / width) * 100}%`,
            top: `${(tooltip.y / height) * 100}%`
          }}
        >
          <strong>{tooltip.title}</strong>
          <span>{tooltip.value}</span>
          <small>{tooltip.source}</small>
        </div>
      ) : null}
    </div>,
    "Hover, focus, or click chart marks to inspect values. Press Enter or Space to pin tooltips; Escape clears.",
    defaultLegend
  );
}
