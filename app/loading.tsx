export default function GlobalLoading() {
  return (
    <div className="page-grid" aria-live="polite" aria-busy="true">
      <section className="panel panel--dark loading-panel">
        <div className="loading-bar loading-bar--wide" />
        <div className="loading-bar" />
        <div className="loading-bar loading-bar--short" />
      </section>

      <section className="panel loading-panel">
        <div className="loading-bar loading-bar--wide" />
        <div className="loading-bar loading-bar--mid" />
      </section>

      <section className="panel loading-panel">
        <div className="loading-map-skeleton" />
      </section>
    </div>
  );
}
