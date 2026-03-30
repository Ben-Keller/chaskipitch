const els = {
  workspace: document.getElementById("workspace"),
  progressLine: document.getElementById("progress-line"),
  outputLine: document.getElementById("output-line"),
  errorPanel: document.getElementById("error-panel"),
  prevBtn: document.getElementById("prev-btn"),
  saveNextBtn: document.getElementById("save-next-btn"),
  themeList: document.getElementById("theme-list"),
  currentThemeName: document.getElementById("current-theme-name"),
  currentThemeSlug: document.getElementById("current-theme-slug"),
  currentMappingLine: document.getElementById("current-mapping-line"),
  savedMappingLine: document.getElementById("saved-mapping-line"),
  draftMappingLine: document.getElementById("draft-mapping-line"),
  textureSearch: document.getElementById("texture-search"),
  textureCountLine: document.getElementById("texture-count-line"),
  textureGrid: document.getElementById("texture-grid")
};

const state = {
  themes: [],
  textures: [],
  currentIndex: 0,
  draftTextureByTheme: new Map(),
  outputFile: "",
  searchQuery: "",
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

function basename(filePath) {
  const value = String(filePath || "");
  const parts = value.split("/");
  return parts[parts.length - 1] || value;
}

function currentTheme() {
  return state.themes[state.currentIndex] || null;
}

function effectiveTexture(theme) {
  return (
    state.draftTextureByTheme.get(theme.slug) ||
    theme.saved_selection?.texture_path ||
    theme.current_texture ||
    null
  );
}

function savedCount() {
  return state.themes.filter((theme) => Boolean(theme.saved_selection)).length;
}

function renderProgress() {
  const total = state.themes.length;
  const current = total ? state.currentIndex + 1 : 0;
  els.progressLine.textContent = `Theme ${current}/${total} | Saved ${savedCount()}/${total}`;
  els.outputLine.textContent = state.outputFile ? `Output: ${state.outputFile}` : "";
}

function renderThemeList() {
  els.themeList.innerHTML = "";
  state.themes.forEach((theme, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `theme-item${index === state.currentIndex ? " is-active" : ""}`;
    btn.addEventListener("click", () => {
      state.currentIndex = index;
      render();
    });

    const name = document.createElement("span");
    name.className = "theme-item__name";
    name.textContent = theme.name;

    const draftTexture = state.draftTextureByTheme.get(theme.slug);
    const currentTexture = theme.current_texture;
    const savedTexture = theme.saved_selection?.texture_path;
    const resolvedTexture = effectiveTexture(theme);
    const dirty =
      Boolean(draftTexture) &&
      draftTexture !== (savedTexture || currentTexture || null);

    const meta = document.createElement("span");
    meta.className = "theme-item__meta";
    if (savedTexture) {
      meta.textContent = `Saved | ${basename(resolvedTexture)}${dirty ? " *unsaved draft" : ""}`;
    } else if (resolvedTexture) {
      meta.textContent = `Current | ${basename(resolvedTexture)}${dirty ? " *unsaved draft" : ""}`;
    } else {
      meta.textContent = dirty ? "*unsaved draft" : "No mapping";
    }

    btn.append(name, meta);
    els.themeList.appendChild(btn);
  });
}

function filteredTextures() {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) {
    return state.textures;
  }
  return state.textures.filter((texture) => basename(texture).toLowerCase().includes(query));
}

function renderTextureGrid() {
  const theme = currentTheme();
  if (!theme) {
    els.textureGrid.innerHTML = "";
    return;
  }

  const textures = filteredTextures();
  const selectedTexture = effectiveTexture(theme);
  els.textureGrid.innerHTML = "";
  els.textureCountLine.textContent = `${textures.length} textures shown (${state.textures.length} total)`;

  textures.forEach((texturePath) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `texture-card${selectedTexture === texturePath ? " is-selected" : ""}`;
    card.addEventListener("click", () => {
      state.draftTextureByTheme.set(theme.slug, texturePath);
      render();
    });

    const img = document.createElement("img");
    img.src = `/asset/${texturePath}`;
    img.alt = basename(texturePath);

    const name = document.createElement("span");
    name.className = "texture-card__name";
    name.textContent = basename(texturePath);

    card.append(img, name);
    els.textureGrid.appendChild(card);
  });
}

function renderCurrentTheme() {
  const theme = currentTheme();
  if (!theme) {
    return;
  }

  const selectedTexture = effectiveTexture(theme);
  els.currentThemeName.textContent = theme.name;
  els.currentThemeSlug.textContent = theme.slug;
  els.currentMappingLine.textContent = theme.current_texture
    ? `Current mapping: ${basename(theme.current_texture)}`
    : "Current mapping: none";
  els.savedMappingLine.textContent = theme.saved_selection?.texture_path
    ? `Saved in tool: ${basename(theme.saved_selection.texture_path)}`
    : "Saved in tool: none yet";
  els.draftMappingLine.textContent = selectedTexture
    ? `Draft selection: ${basename(selectedTexture)}`
    : "Draft selection: none";
}

function renderActions() {
  const theme = currentTheme();
  const selectedTexture = theme ? effectiveTexture(theme) : null;

  els.prevBtn.disabled = state.currentIndex <= 0 || state.saving;
  els.saveNextBtn.disabled = !selectedTexture || state.saving;
  els.saveNextBtn.textContent = state.saving ? "Saving..." : "Save + Next";
}

function render() {
  renderProgress();
  renderThemeList();
  renderCurrentTheme();
  renderTextureGrid();
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
  state.themes = Array.isArray(payload.themes) ? payload.themes : [];
  state.textures = Array.isArray(payload.textures) ? payload.textures : [];
  state.currentIndex = Number.isInteger(payload.first_unassigned_index)
    ? Math.max(0, Math.min(payload.first_unassigned_index, Math.max(state.themes.length - 1, 0)))
    : 0;
  state.outputFile = String(payload.output_file || "");
  state.draftTextureByTheme = new Map(
    state.themes
      .map((theme) => [theme.slug, theme.saved_selection?.texture_path || theme.current_texture || null])
      .filter(([, texture]) => Boolean(texture))
  );
}

async function saveCurrent(andAdvance) {
  const theme = currentTheme();
  if (!theme) {
    return;
  }
  const selectedTexture = effectiveTexture(theme);
  if (!selectedTexture) {
    setError("Choose a texture before saving.");
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
        theme_slug: theme.slug,
        texture_path: selectedTexture
      })
    });

    theme.saved_selection = payload.saved;
    state.outputFile = payload.output_file || state.outputFile;

    if (andAdvance && state.currentIndex < state.themes.length - 1) {
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

  els.textureSearch.addEventListener("input", (event) => {
    state.searchQuery = String(event.target.value || "");
    renderTextureGrid();
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
