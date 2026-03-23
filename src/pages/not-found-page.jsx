export function NotFoundPage() {
  return (
    <div className="page-grid">
      <section className="panel">
        <p className="section-kicker">Not found</p>
        <h1>Page not found</h1>
        <p>The requested section does not exist in this report platform.</p>
        <div className="controls-row">
          <a href="#home">Go home</a>
          <a href="#financials">Open financials</a>
          <a href="#about">Open methodology</a>
        </div>
      </section>
    </div>
  );
}
