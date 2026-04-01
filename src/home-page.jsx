import { reportPath, withBasePath } from "./paths";

const HOME_CARDS = [
  {
    key: "impact",
    tone: "portfolio",
    title: "Tenure Facility",
    description:
      "Interactive map of countries, thematics, and portfolio context for tenure rights work.",
    image: "home/tenure-facility.webp",
    scope: [
      "Global tenure-rights portfolio interface",
      "Country, thematic, and regional context"
    ],
    status: "Core Platform",
  },
  {
    key: "creative_pitch",
    tone: "creative",
    title: "Creative Pitch",
    description:
      "Immersive narrative sequence for presenting the proposal as a visual story experience.",
    image: "home/creative-pitch.webp",
    scope: [
      "Narrative scrollytelling presentation mode",
      "Visual sequencing for proposal storytelling"
    ],
    status: "Narrative Mode",
  },
  {
    key: "films",
    tone: "films",
    title: "Our Films",
    description:
      "Curated Vimeo references for related films developed by Chaski Global and partners.",
    image: "home/our-films.webp",
    scope: [
      "Reference film library for story direction",
      "Curated cinematic precedents tied to this proposal"
    ],
    status: "Reference Library",
  }
];

export function HomePage({ onNavigate, creativePitchEnabled = true }) {
  const logoSrc = withBasePath("icons/cg-logo.svg");
  const proposalIconSrc = withBasePath("icons/pdf.svg");
  const proposalHref = reportPath("ChaskiGlobal_TenureFacility10YearCelebration_Final_3.2026.pdf");

  return (
    <div className="page-grid home-splash">
      <section className="home-hero">
        <div className="home-hero__stage">
          <div className="home-hero__message">
            <div className="home-hero__identity">
              <a
                className="home-hero__brand"
                href="https://chaskiglobal.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="Visit Chaski Global website"
              >
                <img src={logoSrc} alt="Chaski Global logo" loading="lazy" decoding="async" />
              </a>
              <div className="home-hero__title-block">
                <h1 className="home-hero__title">Chaski Global Proposal</h1>
                <p className="home-hero__subtitle">Tenure Facility 10-Years Project</p>
              </div>
              <a className="home-hero__download-btn" href={proposalHref} download>
                <img
                  className="home-hero__download-icon-image"
                  src={proposalIconSrc}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                />
                <span>Full proposal</span>
              </a>
            </div>
            <p className="home-hero__statement">
              Rooted: A story of land, people, and the movement connecting them. Explore the
              Tenure Facility dashboard, creative proposal, and our selected films below.
            </p>
          </div>
        </div>
      </section>

      <section className="home-entry-grid" aria-label="Project pages">
        {HOME_CARDS.map((card) => {
          const isCreativeCard = card.key === "creative_pitch";
          const isAvailable = !isCreativeCard || creativePitchEnabled;
          const helperText = isAvailable
            ? card.status
            : "Unavailable in this build";
          const navLabel = isAvailable ? "View" : "Unavailable";
          const imageSrc = card.image ? withBasePath(card.image) : "";
          return (
            <button
              key={card.key}
              type="button"
              className={`home-entry home-entry--${card.tone}`}
              onClick={() => isAvailable && onNavigate?.(card.key)}
              disabled={!isAvailable}
            >
              <div className="home-entry__visual">
                {imageSrc ? (
                  <img
                    className="home-entry__visual-image"
                    src={imageSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                <div className="home-entry__fade" aria-hidden="true" />
                <div className="home-entry__overlay">
                  <p className="home-entry__status">{helperText}</p>
                  <h2 className="home-entry__title">{card.title}</h2>
                </div>
                <span className="home-entry__nav" aria-hidden="true">
                  <span>{navLabel}</span>
                  <svg
                    className="home-entry__nav-icon"
                    viewBox="0 0 16 16"
                    role="presentation"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <path d="M3 8h9M8 3l5 5-5 5" />
                  </svg>
                </span>
              </div>
              <p className="home-entry__description">{card.description}</p>
              <ul className="home-entry__points">
                {card.scope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </section>
    </div>
  );
}
