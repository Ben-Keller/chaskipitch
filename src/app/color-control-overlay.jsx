import { useMemo, useState } from "react";

function scopeLabel(scope) {
  if (scope === "home") return "Home";
  if (scope === "impact") return "Tenure Facility";
  if (scope === "films") return "Our Films";
  return "Page";
}

export function ColorControlOverlay({
  scope,
  categories,
  selectedThemes,
  onThemeChange,
  onSave,
  onReset
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");

  const overlayTitle = useMemo(
    () => `${scopeLabel(scope)} Color Themes (Temporary)`,
    [scope]
  );

  return (
    <aside className={`color-control-overlay${isOpen ? " is-open" : ""}`} aria-label={overlayTitle}>
      <button
        type="button"
        className="color-control-overlay__toggle"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? "Close Themes" : "Open Themes"}
      </button>

      {isOpen ? (
        <div className="color-control-overlay__panel">
          <header>
            <p>{overlayTitle}</p>
            {lastSavedAt ? <span>Saved {lastSavedAt}</span> : null}
          </header>

          <div className="color-control-overlay__sections">
            {categories.map((category) => (
              <section key={category.id}>
                <h3>{category.label}</h3>
                <div className="color-control-overlay__grid">
                  <label>
                    <span>{category.label}</span>
                    <select
                      value={selectedThemes?.[category.id] ?? category.options[0]?.id ?? ""}
                      onChange={(event) => onThemeChange?.(category.id, event.target.value)}
                    >
                      {category.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            ))}
          </div>

          <div className="color-control-overlay__actions">
            <button
              type="button"
              onClick={() => {
                onSave?.();
                setLastSavedAt(new Date().toLocaleTimeString());
              }}
            >
              Save Control JSON
            </button>
            <button type="button" className="is-secondary" onClick={() => onReset?.()}>
              Reset Page Colors
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
