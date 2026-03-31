const els = {
  workspace: document.getElementById("workspace"),
  progressLine: document.getElementById("progress-line"),
  outputLine: document.getElementById("output-line"),
  errorPanel: document.getElementById("error-panel"),
  prevBtn: document.getElementById("prev-btn"),
  saveNextBtn: document.getElementById("save-next-btn"),
  filmList: document.getElementById("film-list"),
  currentFilmTitle: document.getElementById("current-film-title"),
  currentFilmSubtitle: document.getElementById("current-film-subtitle"),
  currentFilmId: document.getElementById("current-film-id"),
  savedFontLine: document.getElementById("saved-font-line"),
  draftFontLine: document.getElementById("draft-font-line"),
  fontAvailabilityLine: document.getElementById("font-availability-line"),
  fontCountLine: document.getElementById("font-count-line"),
  fontGrid: document.getElementById("font-grid"),
  fontPreview: document.getElementById("font-preview"),
  fontPreviewTitle: document.getElementById("font-preview-title")
};

const state = {
  films: [],
  fontOptions: [],
  currentIndex: 0,
  draftFontByFilm: new Map(),
  outputFile: "",
  saving: false
};

function setError(message) {
  if (!message) {
    els.errorPanel.textContent = "";
    els.errorPanel.classList.add("hidden");
    return;
  }
  els.errorPanel.textContent = message;
  els.errorPanel.classList.remove("hidden");
}

function currentFilm() {
  return state.films[state.currentIndex] || null;
}

function effectiveFontClass(film) {
  return (
    state.draftFontByFilm.get(film.id) ||
    film.saved_selection?.font_class ||
    film.default_font_class ||
    ""
  );
}

function savedCount() {
  return state.films.filter((film) => Boolean(film.saved_selection)).length;
}

function labelForFontClass(fontClass) {
  const option = state.fontOptions.find((entry) => entry.font_class === fontClass);
  return option?.label || fontClass || "none";
}

function renderProgress() {
  const total = state.films.length;
  const current = total ? state.currentIndex + 1 : 0;
  els.progressLine.textContent = `Film ${current}/${total} | Saved ${savedCount()}/${total}`;
  els.outputLine.textContent = state.outputFile ? `Output: ${state.outputFile}` : "";
}

function renderFilmList() {
  els.filmList.innerHTML = "";
  state.films.forEach((film, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `film-item${index === state.currentIndex ? " is-active" : ""}`;
    btn.addEventListener("click", () => {
      state.currentIndex = index;
      render();
    });

    const title = document.createElement("span");
    title.className = "film-item__title";
    title.textContent = film.title;

    const meta = document.createElement("span");
    meta.className = "film-item__meta";
    const selected = effectiveFontClass(film);
    const dirty =
      Boolean(state.draftFontByFilm.get(film.id)) &&
      state.draftFontByFilm.get(film.id) !==
        (film.saved_selection?.font_class || film.default_font_class || "");
    meta.textContent = `${film.saved_selection ? "Saved" : "Current"} | ${labelForFontClass(selected)}${
      dirty ? " *unsaved draft" : ""
    }`;

    btn.append(title, meta);
    els.filmList.appendChild(btn);
  });
}

function renderCurrentFilm() {
  const film = currentFilm();
  if (!film) {
    return;
  }

  const selectedClass = effectiveFontClass(film);
  els.currentFilmTitle.textContent = film.title;
  els.currentFilmSubtitle.textContent = film.subtitle || "";
  els.currentFilmId.textContent = `film_id: ${film.id}`;
  els.savedFontLine.textContent = film.saved_selection?.font_class
    ? `Saved in tool: ${labelForFontClass(film.saved_selection.font_class)}`
    : "Saved in tool: none yet";
  els.draftFontLine.textContent = selectedClass
    ? `Draft selection: ${labelForFontClass(selectedClass)}`
    : "Draft selection: none";

  if (selectedClass === "films2-title-font--century-gothic") {
    const hasCenturyGothic =
      typeof document !== "undefined" &&
      document.fonts &&
      typeof document.fonts.check === "function" &&
      document.fonts.check('16px "Century Gothic"');
    els.fontAvailabilityLine.textContent = hasCenturyGothic
      ? "Century Gothic is available on this system."
      : "Century Gothic is not available on this system. Fallback font is shown.";
  } else {
    els.fontAvailabilityLine.textContent = "";
  }

  els.fontPreview.className = `font-preview ${selectedClass}`.trim();
  els.fontPreviewTitle.textContent = film.title;
}

function renderFontOptions() {
  const film = currentFilm();
  if (!film) {
    els.fontGrid.innerHTML = "";
    return;
  }

  const selectedClass = effectiveFontClass(film);
  els.fontCountLine.textContent = `${state.fontOptions.length} font options`;
  els.fontGrid.innerHTML = "";

  state.fontOptions.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `font-option ${option.font_class}${
      option.font_class === selectedClass ? " is-selected" : ""
    }`;
    btn.addEventListener("click", () => {
      state.draftFontByFilm.set(film.id, option.font_class);
      render();
    });

    const label = document.createElement("span");
    label.className = "font-option__label";
    label.textContent = option.label;

    const sample = document.createElement("span");
    sample.className = "font-option__sample";
    sample.textContent = film.title;

    btn.append(label, sample);
    els.fontGrid.appendChild(btn);
  });
}

function renderActions() {
  const film = currentFilm();
  const selectedClass = film ? effectiveFontClass(film) : "";

  els.prevBtn.disabled = state.currentIndex <= 0 || state.saving;
  els.saveNextBtn.disabled = !selectedClass || state.saving;
  els.saveNextBtn.textContent = state.saving ? "Saving..." : "Save + Next";
}

function render() {
  renderProgress();
  renderFilmList();
  renderCurrentFilm();
  renderFontOptions();
  renderActions();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function loadBootstrap() {
  const payload = await fetchJson("/api/bootstrap");
  state.films = Array.isArray(payload.films) ? payload.films : [];
  state.fontOptions = Array.isArray(payload.font_options) ? payload.font_options : [];
  state.currentIndex = Number.isInteger(payload.first_unassigned_index)
    ? Math.max(0, Math.min(payload.first_unassigned_index, Math.max(state.films.length - 1, 0)))
    : 0;
  state.outputFile = String(payload.output_file || "");
  state.draftFontByFilm = new Map(
    state.films
      .map((film) => [film.id, film.saved_selection?.font_class || film.default_font_class || ""])
      .filter(([, fontClass]) => Boolean(fontClass))
  );
}

async function saveCurrent(andAdvance) {
  const film = currentFilm();
  if (!film) {
    return;
  }
  const fontClass = effectiveFontClass(film);
  if (!fontClass) {
    setError("Choose a font before saving.");
    return;
  }

  try {
    setError("");
    state.saving = true;
    renderActions();
    const payload = await fetchJson("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        film_id: film.id,
        font_class: fontClass
      })
    });

    film.saved_selection = payload.saved;
    state.outputFile = payload.output_file || state.outputFile;

    if (andAdvance && state.currentIndex < state.films.length - 1) {
      state.currentIndex += 1;
    }
    render();
  } catch (error) {
    setError(error?.message || String(error));
  } finally {
    state.saving = false;
    renderActions();
  }
}

function registerEvents() {
  els.prevBtn.addEventListener("click", () => {
    if (state.currentIndex > 0) {
      state.currentIndex -= 1;
      render();
    }
  });

  els.saveNextBtn.addEventListener("click", () => {
    saveCurrent(true);
  });
}

async function init() {
  try {
    setError("");
    await loadBootstrap();
    registerEvents();
    els.workspace.classList.remove("hidden");
    render();
  } catch (error) {
    setError(error?.message || String(error));
  }
}

init();
