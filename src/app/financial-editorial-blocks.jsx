import { SourcePill } from "./source-pill";
import { mediaPath } from "../lib/paths";

function uniquePages(pages) {
  return Array.from(new Set((pages ?? []).filter((page) => Number.isFinite(page))));
}

function SourcePills({ pages, showSources = true }) {
  if (!showSources) {
    return null;
  }
  const unique = uniquePages(pages);
  if (!unique.length) {
    return null;
  }

  return (
    <div className="financial-editorial-sources" aria-label="Source pages">
      {unique.map((page) => (
        <SourcePill key={page} page={page} />
      ))}
    </div>
  );
}

function ModuleQuote({ quote, showSources = true }) {
  if (!quote?.text) {
    return null;
  }

  return (
    <blockquote className="financial-editorial-quote">
      <p>{quote.text}</p>
      <footer>
        {quote.attribution} {showSources && quote.source_page ? <SourcePill page={quote.source_page} /> : null}
      </footer>
    </blockquote>
  );
}

function ModuleAside({ aside, showSources = true }) {
  if (!aside?.title) {
    return null;
  }

  return (
    <aside className="financial-editorial-aside" aria-label={aside.title}>
      <h3>{aside.title}</h3>
      <ul>
        {(aside.items ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {showSources && aside.source_page ? (
        <p className="note">
          <SourcePill page={aside.source_page} />
        </p>
      ) : null}
    </aside>
  );
}

export function FinancialEditorialBlocks({
  editorial,
  showHero = true,
  showSupporters = true,
  showSources = true,
  hiddenModuleIds = []
}) {
  if (!editorial) {
    return null;
  }

  const hero = editorial.hero ?? null;
  const hiddenModuleSet = new Set(
    Array.isArray(hiddenModuleIds) ? hiddenModuleIds.map((id) => String(id)) : []
  );
  const modules = (Array.isArray(editorial.modules) ? editorial.modules : []).filter(
    (module) => !hiddenModuleSet.has(String(module?.id))
  );
  const supporters = editorial.supporters ?? null;
  const newSupporterSet = new Set((supporters?.new_in_2024 ?? []).map((name) => String(name)));

  return (
    <>
      {showHero && hero ? (
        <section className="panel panel--dark financial-editorial-hero" aria-labelledby="financial-editorial-hero-title">
          <p className="section-kicker" style={{ color: "#9fd6c9" }}>
            {hero.kicker ?? "Editorial framing"}
          </p>
          <h2 id="financial-editorial-hero-title">{hero.title}</h2>
          {hero.summary ? <p>{hero.summary}</p> : null}
          <SourcePills pages={hero.source_pages} showSources={showSources} />
        </section>
      ) : null}

      {modules.map((module) => {
        const layoutClass = module.layout ? `financial-editorial-module--${module.layout}` : "";
        return (
          <section className={`panel financial-editorial-module ${layoutClass}`.trim()} key={module.id}>
            <header className="financial-editorial-module__header">
              {module.kicker ? <p className="section-kicker">{module.kicker}</p> : null}
              <h2>{module.title}</h2>
              {module.summary ? <p>{module.summary}</p> : null}
              <SourcePills pages={module.source_pages} showSources={showSources} />
            </header>

            <div className="financial-editorial-module__content">
              <div className="financial-editorial-text-columns">
                {(module.columns ?? []).map((column) => (
                  <article key={column.heading ?? column.paragraphs?.[0]} className="financial-editorial-text-card">
                    {column.heading ? <h3>{column.heading}</h3> : null}
                    {(column.paragraphs ?? []).map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </article>
                ))}

                <ModuleQuote quote={module.quote} showSources={showSources} />

                {module.motif ? (
                  <article className="financial-editorial-motif" aria-label={module.motif.title ?? "Motif"}>
                    <div className="financial-editorial-motif__pattern" aria-hidden="true" />
                    <div>
                      {module.motif.title ? <h3>{module.motif.title}</h3> : null}
                      {module.motif.description ? <p>{module.motif.description}</p> : null}
                    </div>
                  </article>
                ) : null}
              </div>

              {module.media?.file ? (
                <figure className="financial-editorial-photo">
                  <img
                    src={mediaPath(module.media.file)}
                    alt={module.media.alt ?? "Financial editorial image"}
                    loading="lazy"
                  />
                  <figcaption>
                    {module.media.caption ?? ""}{" "}
                    {showSources && module.media.source_page ? <SourcePill page={module.media.source_page} /> : null}
                  </figcaption>
                </figure>
              ) : null}

              <ModuleAside aside={module.aside} showSources={showSources} />
            </div>
          </section>
        );
      })}

      {showSupporters && supporters ? (
        <section className="panel financial-supporters" aria-labelledby="financial-supporters-title">
          <h2 id="financial-supporters-title">{supporters.title}</h2>
          {supporters.description ? <p>{supporters.description}</p> : null}
          <div className="financial-supporters__list" role="list">
            {(supporters.names ?? []).map((name) => (
              <span key={name} role="listitem" className="financial-supporters__chip">
                {name}
                {newSupporterSet.has(name) ? (
                  <em className="financial-supporters__new">New in 2024</em>
                ) : null}
              </span>
            ))}
          </div>
          <p className="note">
            {supporters.note ?? ""} {showSources && supporters.source_page ? <SourcePill page={supporters.source_page} /> : null}
          </p>
        </section>
      ) : null}
    </>
  );
}
