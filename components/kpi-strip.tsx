import { KpiDerivationEntry, KpiValue } from "@/lib/types";
import { formatUnit } from "@/lib/format";
import { SourcePill } from "@/components/source-pill";

interface KpiStripProps {
  kpis: KpiValue[];
  derivationsByKpiId?: Record<string, KpiDerivationEntry>;
}

export function KpiStrip({ kpis, derivationsByKpiId }: KpiStripProps) {
  return (
    <section className="kpi-strip" aria-label="Key performance indicators">
      {kpis.map((kpi) => {
        const derivation = derivationsByKpiId?.[kpi.id];
        return (
          <article key={kpi.id} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{formatUnit(kpi.value, kpi.unit)}</div>
            {derivation ? (
              <p className="note" style={{ margin: "0.25rem 0 0.1rem", fontSize: "0.68rem" }} title={derivation.formula}>
                {derivation.method.replaceAll("_", " ")}
              </p>
            ) : null}
            <SourcePill page={kpi.source_page} />
          </article>
        );
      })}
    </section>
  );
}
