const defaultNavItems = [
  { key: "impact", label: "Impact" },
  { key: "financials", label: "Financials" },
  { key: "about", label: "About" }
];

export function SiteHeader({
  activePage = "impact",
  onNavigate,
  showNav = true,
  navItems = defaultNavItems,
  subtitle = "Immersive editorial dashboard"
}) {
  return (
    <header className="site-header" role="banner">
      <div className="site-header__inner">
        <button
          type="button"
          className="brand brand--button"
          onClick={() => onNavigate?.("impact")}
          aria-label="Tenure Facility Annual Report 2024 home"
        >
          <span className="brand__eyebrow">Tenure Facility</span>
          <span className="brand__title">Annual Report 2024 Platform</span>
        </button>
        {showNav ? (
          <nav aria-label="Primary">
            <ul className="main-nav">
              {navItems.map((link) => {
                const active = activePage === link.key;
                return (
                  <li key={link.key}>
                    <button
                      type="button"
                      className={active ? "active" : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={() => onNavigate?.(link.key)}
                    >
                      {link.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : (
          <p className="site-header__compact-note">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
