import { useEffect, useRef } from "react";

export function SearchPanel({ query, onQueryChange, countries, themes, onCountrySelect, onThemeSelect }) {
  const inputRef = useRef(null);
  const normalized = query.trim().toLowerCase();

  const countryMatches = normalized
    ? countries.filter((country) => country.name.toLowerCase().includes(normalized)).slice(0, 5)
    : [];

  const themeMatches = normalized
    ? themes.filter((theme) => theme.name.toLowerCase().includes(normalized)).slice(0, 4)
    : [];

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const targetIsEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (event.key === "/" && !targetIsEditable) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && target === inputRef.current) {
        onQueryChange("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onQueryChange]);

  function renderHighlighted(value) {
    if (!normalized) {
      return value;
    }

    const lower = value.toLowerCase();
    const index = lower.indexOf(normalized);
    if (index < 0) {
      return value;
    }

    const start = value.slice(0, index);
    const match = value.slice(index, index + normalized.length);
    const end = value.slice(index + normalized.length);

    return (
      <>
        {start}
        <mark>{match}</mark>
        {end}
      </>
    );
  }

  const handleCountryPick = (iso3) => {
    if (typeof onCountrySelect === "function") {
      onCountrySelect(iso3);
      onQueryChange("");
    }
  };

  const handleThemePick = (slug) => {
    if (typeof onThemeSelect === "function") {
      onThemeSelect(slug);
      onQueryChange("");
    }
  };

  return (
    <section className="panel" aria-labelledby="search-heading">
      <p className="section-kicker">Search</p>
      <h2 id="search-heading">Find countries and themes</h2>
      <div className="controls-row">
        <label htmlFor="search-input" className="note">
          Search
        </label>
        <input
          id="search-input"
          type="search"
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Try: Brazil, women, finance"
          aria-describedby="search-help"
        />
      </div>
      <p id="search-help" className="note">
        Search results include country and thematic detail modules in Home. Press <kbd>/</kbd> to focus search.
      </p>
      {normalized ? (
        <ul className="search-results" aria-label="Search results">
          {countryMatches.map((country) => (
            <li key={country.iso3}>
              <button
                type="button"
                className="search-results__button"
                onClick={() => handleCountryPick(country.iso3)}
              >
                <span>{renderHighlighted(country.name)}</span>
                <span className="note">Country</span>
              </button>
            </li>
          ))}
          {themeMatches.map((theme) => (
            <li key={theme.slug}>
              <button
                type="button"
                className="search-results__button"
                onClick={() => handleThemePick(theme.slug)}
              >
                <span>{renderHighlighted(theme.name)}</span>
                <span className="note">Theme</span>
              </button>
            </li>
          ))}
          {countryMatches.length === 0 && themeMatches.length === 0 ? <li className="note">No matches yet.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
