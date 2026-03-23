import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel">
      <p className="section-kicker">Not found</p>
      <h1>This story could not be located</h1>
      <p>The requested route is not available in the current report dataset.</p>
      <div className="controls-row">
        <Link href="/">Home</Link>
        <Link href="/countries">Country Explorer</Link>
        <Link href="/thematics">Thematics</Link>
      </div>
    </section>
  );
}
