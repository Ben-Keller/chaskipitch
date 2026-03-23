"use client";

import { useId, useMemo, useState } from "react";
import { scaleBand, scaleLinear, line as d3Line, max, curveMonotoneX } from "d3";
import { ChartContent } from "@/lib/types";
import { formatUnit } from "@/lib/format";
import { SourcePill } from "@/components/source-pill";

interface TooltipState {
  x: number;
  y: number;
  title: string;
  value: string;
  source: string;
}

interface FinancialChartProps {
  chart: ChartContent;
}

interface NormalizedPoint {
  label: string;
  raw: Record<string, string | number>;
  values: Record<string, number>;
}

const width = 860;
const height = 320;
const margin = { top: 22, right: 74, bottom: 70, left: 74 };

function toNumeric(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return 0;
}

function inferDefaultXKey(chart: ChartContent): string {
  const first = chart.data_points[0] ?? {};
  if ("year" in first) return "year";
  if ("label" in first) return "label";
  if ("metric" in first) return "metric";
  return Object.keys(first)[0] ?? "label";
}

function entryLabel(entry: Record<string, string | number>, xKey: string): string {
  const xValue = entry[xKey];
  if (typeof xValue === "string" || typeof xValue === "number") {
    return String(xValue);
  }

  if (typeof entry.label === "string") return entry.label;
  if (typeof entry.metric === "string") return entry.metric;
  if (typeof entry.year === "number") return String(entry.year);
  return "Value";
}

function prettyColumnLabel(key: string): string {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function FinancialChart({ chart }: FinancialChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [pinnedTooltipKey, setPinnedTooltipKey] = useState<string | null>(null);
  const [showRawTable, setShowRawTable] = useState(false);
  const rawTableId = useId();
  const tooltipHelpId = `${chart.slug}-tooltip-help`;

  const xKey = chart.chart_config?.x_key ?? inferDefaultXKey(chart);

  const series = useMemo(() => {
    if (chart.chart_config?.series?.length) {
      return chart.chart_config.series;
    }

    return [
      {
        key: "value",
        label: chart.title,
        type: chart.chart_type === "line" ? "line" : "bar",
        axis: "left" as const,
        color: chart.chart_type === "stacked_bar" ? "#a74d3f" : "#2f7f73",
        unit: chart.units
      }
    ];
  }, [chart.chart_config?.series, chart.chart_type, chart.title, chart.units]);

  const unitBySeriesKey = useMemo(
    () => Object.fromEntries(series.map((item) => [item.key, item.unit ?? chart.units])),
    [chart.units, series]
  );

  const points = useMemo<NormalizedPoint[]>(
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

  const x = scaleBand<string>()
    .domain(points.map((point) => point.label))
    .range([margin.left, width - margin.right])
    .padding(0.22);

  const getSeriesUnit = (seriesKey: string, row?: Record<string, string | number>): string => {
    if (row && typeof row.unit === "string" && seriesKey === "value") {
      return row.unit;
    }
    return unitBySeriesKey[seriesKey] ?? chart.units;
  };

  const formatSeriesValue = (seriesKey: string, value: number, row?: Record<string, string | number>): string => {
    return formatUnit(value, getSeriesUnit(seriesKey, row));
  };

  const formatRawCell = (columnKey: string, value: string | number, row: Record<string, string | number>): string => {
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

    const seen = new Set<string>();
    chart.data_points.forEach((row) => {
      Object.keys(row).forEach((key) => seen.add(key));
    });

    return Array.from(seen).map((key) => ({
      key,
      label: prettyColumnLabel(key)
    }));
  }, [chart.data_points, chart.raw_table?.columns]);

  const provenanceSource =
    chart.provenance?.source_note ??
    chart.source_refs?.[0]?.note ??
    `Report chart transcription from page ${chart.source_page}`;

  const sourceRefSummary =
    chart.source_refs?.map((ref) => `p.${ref.source_page} (${ref.source_type})`).join(" | ") ??
    `p.${chart.source_page}`;

  const leftAxisUnit =
    chart.chart_config?.y_left_unit ??
    leftSeries[0]?.unit ??
    (chart.chart_type === "paired_metric" ? "%" : chart.units);

  const rightAxisUnit = chart.chart_config?.y_right_unit ?? rightSeries[0]?.unit ?? chart.units;

  const renderLegend = series.length > 1;

  const revealTooltip = (key: string, payload: TooltipState, pin = false) => {
    setTooltip(payload);
    if (pin) {
      setPinnedTooltipKey(key);
    }
  };

  const dismissTooltip = (key: string) => {
    if (pinnedTooltipKey && pinnedTooltipKey !== key) {
      return;
    }
    setTooltip(null);
    if (pinnedTooltipKey === key) {
      setPinnedTooltipKey(null);
    }
  };

  const togglePinnedTooltip = (key: string, payload: TooltipState) => {
    if (pinnedTooltipKey === key) {
      setPinnedTooltipKey(null);
      setTooltip(null);
      return;
    }
    revealTooltip(key, payload, true);
  };

  if (chart.chart_type === "paired_metric") {
    const metricSeries = series[0];

    return (
      <article
        className="panel"
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
            <SourcePill page={chart.source_page} />
            <button
              type="button"
              className="chart-toggle"
              onClick={() => setShowRawTable((value) => !value)}
              aria-expanded={showRawTable}
              aria-controls={rawTableId}
            >
              {showRawTable ? "Hide raw table" : "Show raw table"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.7rem" }}>
          {points.map((point) => {
            const value = point.values[metricSeries.key];
            const unit = getSeriesUnit(metricSeries.key, point.raw);
            return (
              <div key={point.label}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <span>{point.label}</span>
                  <strong>{formatUnit(value, unit === "percent" ? "%" : unit)}</strong>
                </div>
                <div
                  style={{
                    marginTop: "0.25rem",
                    height: "0.65rem",
                    borderRadius: "999px",
                    background: "rgba(22,63,57,0.14)",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(value, 140)}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #2f7f73, #3ca696)"
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <ul className="note" style={{ marginTop: "0.8rem" }}>
          {chart.footnotes.map((footnote) => (
            <li key={footnote}>{footnote}</li>
          ))}
        </ul>

        <p id={tooltipHelpId} className="note chart-a11y-note">
          Use the raw table toggle for keyboard and touch-friendly value inspection.
        </p>

        {showRawTable ? (
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
        ) : null}

        <section className="chart-provenance" aria-label="Chart provenance">
          <p>
            <strong>Figure:</strong> {chart.chart_config?.figure_id ?? chart.source_refs?.[0]?.source_id ?? "N/A"}
          </p>
          <p>
            <strong>Source refs:</strong> {sourceRefSummary}
          </p>
          <p>
            <strong>Method:</strong> {chart.provenance?.extraction_method ?? "transcribed_from_figure"}
          </p>
          <p>
            <strong>Source note:</strong> {provenanceSource}
          </p>
          {chart.provenance?.raw_input_refs?.length ? (
            <p>
              <strong>Raw inputs:</strong> {chart.provenance.raw_input_refs.join(" | ")}
            </p>
          ) : null}
          {typeof chart.confidence === "number" ? (
            <p>
              <strong>Confidence:</strong> {(chart.confidence * 100).toFixed(0)}%
            </p>
          ) : null}
        </section>
      </article>
    );
  }

  return (
    <article
      className="panel"
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
          <SourcePill page={chart.source_page} />
          <button
            type="button"
            className="chart-toggle"
            onClick={() => setShowRawTable((value) => !value)}
            aria-expanded={showRawTable}
            aria-controls={rawTableId}
          >
            {showRawTable ? "Hide raw table" : "Show raw table"}
          </button>
        </div>
      </div>

      {renderLegend ? (
        <div className="chart-legend" role="list" aria-label="Series legend">
          {series.map((item) => (
            <span key={item.key} className="chart-legend__item" role="listitem">
              <span className="chart-legend__swatch" style={{ background: item.color }} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      <p id={tooltipHelpId} className="note chart-a11y-note">
        Hover, focus, click, or press Enter on chart marks to inspect values. Press Escape to clear pinned tooltip.
      </p>

      <div className="chart-wrap" style={{ marginTop: "0.75rem" }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
          {yLeft.ticks(5).map((tick) => (
            <g key={`left-${tick}`}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={yLeft(tick)}
                y2={yLeft(tick)}
                stroke="rgba(15,52,45,0.14)"
              />
              <text x={margin.left - 10} y={yLeft(tick) + 4} textAnchor="end" fontSize="11" fill="#255148">
                {formatUnit(tick, leftAxisUnit)}
              </text>
            </g>
          ))}

          {rightSeries.length
            ? yRight.ticks(5).map((tick) => (
                <text
                  key={`right-${tick}`}
                  x={width - margin.right + 10}
                  y={yRight(tick) + 4}
                  textAnchor="start"
                  fontSize="11"
                  fill="#6c3b34"
                >
                  {formatUnit(tick, rightAxisUnit)}
                </text>
              ))
            : null}

          {series
            .filter((item) => item.type === "line")
            .map((item) => {
              const linePath = d3Line<NormalizedPoint>()
                .x((point) => (x(point.label) ?? 0) + x.bandwidth() / 2)
                .y((point) => (item.axis === "right" ? yRight(point.values[item.key]) : yLeft(point.values[item.key])))
                .curve(curveMonotoneX);

              return (
                <g key={`line-${item.key}`}>
                  <path d={linePath(points) ?? ""} fill="none" stroke={item.color} strokeWidth="3" />
                  {points.map((point) => {
                    const cx = (x(point.label) ?? 0) + x.bandwidth() / 2;
                    const cy = item.axis === "right" ? yRight(point.values[item.key]) : yLeft(point.values[item.key]);
                    const tooltipKey = `${chart.slug}-line-${item.key}-${point.label}`;
                    const payload: TooltipState = {
                      x: cx,
                      y: cy,
                      title: `${point.label} · ${item.label}`,
                      value: formatSeriesValue(item.key, point.values[item.key], point.raw),
                      source: provenanceSource
                    };
                    return (
                      <circle
                        key={`${item.key}-${point.label}`}
                        cx={cx}
                        cy={cy}
                        r={4.5}
                        fill={item.color}
                        tabIndex={0}
                        role="button"
                        aria-label={`${point.label}, ${item.label}: ${payload.value}`}
                        aria-describedby={tooltipHelpId}
                        onMouseEnter={() => {
                          if (!pinnedTooltipKey) {
                            revealTooltip(tooltipKey, payload);
                          }
                        }}
                        onMouseLeave={() => {
                          if (!pinnedTooltipKey) {
                            dismissTooltip(tooltipKey);
                          }
                        }}
                        onFocus={() => revealTooltip(tooltipKey, payload)}
                        onBlur={() => dismissTooltip(tooltipKey)}
                        onClick={() => togglePinnedTooltip(tooltipKey, payload)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            togglePinnedTooltip(tooltipKey, payload);
                          }
                        }}
                      />
                    );
                  })}
                </g>
              );
            })}

          {series.filter((item) => item.type === "bar").length
            ? points.map((point) => {
                const barSeries = series.filter((item) => item.type === "bar");
                return barSeries.map((item, index) => {
                  const xPos = x(point.label) ?? 0;
                  const groupWidth = x.bandwidth();
                  const barWidth = groupWidth / barSeries.length;
                  const value = point.values[item.key];
                  const yPos = item.axis === "right" ? yRight(value) : yLeft(value);
                  const baseY = item.axis === "right" ? yRight(0) : yLeft(0);
                  const barHeight = baseY - yPos;
                  const tooltipKey = `${chart.slug}-bar-${item.key}-${point.label}`;
                  const payload: TooltipState = {
                    x: xPos + index * barWidth + barWidth / 2,
                    y: yPos,
                    title: `${point.label} · ${item.label}`,
                    value: formatSeriesValue(item.key, value, point.raw),
                    source: provenanceSource
                  };

                  return (
                    <rect
                      key={`bar-${item.key}-${point.label}`}
                      x={xPos + index * barWidth}
                      y={yPos}
                      width={barWidth}
                      height={barHeight}
                      fill={item.color}
                      opacity={chart.chart_type === "stacked_bar" ? 0.78 : 0.9}
                      tabIndex={0}
                      role="button"
                      aria-label={`${point.label}, ${item.label}: ${payload.value}`}
                      aria-describedby={tooltipHelpId}
                      onMouseEnter={() => {
                        if (!pinnedTooltipKey) {
                          revealTooltip(tooltipKey, payload);
                        }
                      }}
                      onMouseLeave={() => {
                        if (!pinnedTooltipKey) {
                          dismissTooltip(tooltipKey);
                        }
                      }}
                      onFocus={() => revealTooltip(tooltipKey, payload)}
                      onBlur={() => dismissTooltip(tooltipKey)}
                      onClick={() => togglePinnedTooltip(tooltipKey, payload)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          togglePinnedTooltip(tooltipKey, payload);
                        }
                      }}
                    />
                  );
                });
              })
            : null}

          {points.map((point) => {
            const xPos = (x(point.label) ?? 0) + x.bandwidth() / 2;
            return (
              <text
                key={`${point.label}-axis`}
                x={xPos}
                y={height - margin.bottom + 16}
                textAnchor="middle"
                fontSize="11"
                fill="#1d4a42"
              >
                {point.label.length > 18 ? `${point.label.slice(0, 18)}...` : point.label}
              </text>
            );
          })}
        </svg>

        {tooltip ? (
          <div className="chart-tooltip" style={{ left: tooltip.x + 18, top: tooltip.y + 8 }}>
            <strong>{tooltip.title}</strong>
            <div>{tooltip.value}</div>
            <div className="note" style={{ marginTop: "0.2rem" }}>
              {tooltip.source}
            </div>
          </div>
        ) : null}
      </div>

      <ul className="note" style={{ marginTop: "0.8rem" }}>
        {chart.footnotes.map((footnote) => (
          <li key={footnote}>{footnote}</li>
        ))}
      </ul>

      {showRawTable ? (
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
      ) : null}

      <section className="chart-provenance" aria-label="Chart provenance">
        <p>
          <strong>Figure:</strong> {chart.chart_config?.figure_id ?? chart.source_refs?.[0]?.source_id ?? "N/A"}
        </p>
        <p>
          <strong>Source refs:</strong> {sourceRefSummary}
        </p>
        <p>
          <strong>Method:</strong> {chart.provenance?.extraction_method ?? "transcribed_from_figure"}
        </p>
        <p>
          <strong>Source note:</strong> {provenanceSource}
        </p>
        {chart.provenance?.raw_input_refs?.length ? (
          <p>
            <strong>Raw inputs:</strong> {chart.provenance.raw_input_refs.join(" | ")}
          </p>
        ) : null}
        {chart.provenance?.assumptions?.length ? (
          <p>
            <strong>Assumptions:</strong> {chart.provenance.assumptions.join(" | ")}
          </p>
        ) : null}
        {typeof chart.confidence === "number" ? (
          <p>
            <strong>Confidence:</strong> {(chart.confidence * 100).toFixed(0)}%
          </p>
        ) : null}
      </section>
    </article>
  );
}
