interface SourcePillProps {
  page: number;
  className?: string;
}

export function SourcePill({ page, className }: SourcePillProps) {
  return (
    <span className={className ? `source-pill ${className}` : "source-pill"} title={`Source page ${page}`}>
      p.{page}
    </span>
  );
}
