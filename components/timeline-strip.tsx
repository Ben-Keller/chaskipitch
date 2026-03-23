import { TimelineMilestone } from "@/lib/types";
import { SourcePill } from "@/components/source-pill";
import { formatInteger } from "@/lib/format";

interface TimelineStripProps {
  milestones: TimelineMilestone[];
}

export function TimelineStrip({ milestones }: TimelineStripProps) {
  return (
    <section className="panel" aria-labelledby="timeline-heading">
      <p className="section-kicker">Evolution Timeline</p>
      <h2 id="timeline-heading">Threads in the Tenure Tapestry</h2>
      <div className="timeline-track">
        {milestones.map((milestone) => (
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
            <SourcePill page={milestone.source_page} />
          </article>
        ))}
      </div>
    </section>
  );
}
