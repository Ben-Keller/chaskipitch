import { formatUnit } from "../lib/format";

export function KpiStrip({ kpis, derivationsByKpiId }) {
  const rows = Array.isArray(kpis) ? kpis : [];
  if (!rows.length) {
    return null;
  }

  return (
    <section className="kpi-strip" aria-label="Key performance indicators">
      {rows.map((kpi) => {
        return (
          <article key={kpi.id} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{formatUnit(kpi.value, kpi.unit)}</div>
          </article>
        );
      })}
    </section>
  );
}
