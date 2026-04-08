export function LoadingPanel({ label = "Loading..." }) {
  return (
    <div className="page-grid">
      <section className="not used" role="status" aria-live="polite">
        <h1>{label}</h1>
        <div className="loading-bar" />
        <div className="loading-map-skeleton" />
      </section>
    </div>
  );
}

export function ErrorPanel({ message = "Something went wrong while loading content." }) {
  return (
    <div className="page-grid">
      <section className="panel">
        <h1>Unable to load</h1>
        <p>{message}</p>
      </section>
    </div>
  );
}
