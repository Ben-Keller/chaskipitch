import { sourceLabel } from "../lib/format";

export function SourcePill({ page, className = "" }) {
  if (!Number.isFinite(page)) {
    return null;
  }

  const classes = ["source-pill", className].filter(Boolean).join(" ");
  return <span className={classes}>{sourceLabel(page)}</span>;
}
