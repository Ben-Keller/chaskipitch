const defaultNavItems = [
  { key: "home", label: "Home" },
  { key: "impact", label: "Tenure Facility" },
  { key: "films", label: "Our Films" }
];

export function SiteHeader({
  activePage = "home",
  onNavigate,
  showNav = true,
  navItems = defaultNavItems,
  subtitle = "Tenure Facility 10-Years Project"
}) {
  return (
    <header className="site-header" role="banner">
      <div className="site-header__inner">
        <button
          type="button"
          className="brand brand--button"
          onClick={() => onNavigate?.("home")}
          aria-label="Chaski Global Proposal home"
        >
          <span className="brand__eyebrow">Tenure Facility 10-Years Project</span>
          <span className="brand__title">Chaski Global Proposal</span>
        </button>
        <div className="site-header__actions">
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
      </div>
    </header>
  );
}
