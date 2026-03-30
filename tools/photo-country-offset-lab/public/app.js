const SLICE_OPTIONS = [
  { index: 0, label: "Top", yOffset: -45, objectPositionY: "8%" },
  { index: 1, label: "Upper Middle", yOffset: -15, objectPositionY: "34%" },
  { index: 2, label: "Lower Middle", yOffset: 15, objectPositionY: "66%" },
  { index: 3, label: "Bottom", yOffset: 45, objectPositionY: "92%" }
];
const NA_OPTION_LABEL = "NA (No country mapping)";
const NA_ALIASES = new Set(["na", "n/a", "not applicable", "not mapped", "none"]);

const els = {
  workspace: document.getElementById("workspace"),
  donePanel: document.getElementById("done-panel"),
  errorPanel: document.getElementById("error-panel"),
  progressLine: document.getElementById("progress-line"),
  outputLine: document.getElementById("output-line"),
  photoPath: document.getElementById("photo-path"),
  existingMapping: document.getElementById("existing-mapping"),
  savedMapping: document.getElementById("saved-mapping"),
  countryInput: document.getElementById("country-input"),
  countryResolution: document.getElementById("country-resolution"),
  countryOptions: document.getElementById("country-options"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  fullImage: document.getElementById("full-image"),
  sliceGrid: document.getElementById("slice-grid")
};

const state = {
  photos: [],
  projectCountries: [],
  countryByIso: new Map(),
  countryByLabel: new Map(),
  apiVersion: null,
  currentIndex: 0,
  saving: false,
  form: {
    countryInput: "",
    countryIso3: null,
    sliceIndexes: []
  },
  outputFile: ""
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

function nearestSliceIndex(yOffset) {
  const target = Number(yOffset);
  if (!Number.isFinite(target)) {
    return null;
  }
  let best = null;
  for (const option of SLICE_OPTIONS) {
    const delta = Math.abs(option.yOffset - target);
    if (!best || delta < best.delta) {
      best = { delta, index: option.index };
    }
  }
  return best ? best.index : null;
}

function normalizeSliceIndexes(indexes) {
  const valid = (Array.isArray(indexes) ? indexes : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 3);
  return [...new Set(valid)].sort((a, b) => a - b);
}

function averageYOffsetFromIndexes(indexes) {
  const normalized = normalizeSliceIndexes(indexes);
  if (!normalized.length) {
    return null;
  }
  const total = normalized.reduce((sum, index) => sum + SLICE_OPTIONS[index].yOffset, 0);
  return Number((total / normalized.length).toFixed(2));
}

function formatCurrentMapping(photo) {
  const mapping = photo.current_assignment;
  if (!mapping) {
    return "Current mapping: none";
  }
  return `Current mapping: ${mapping.country_name} (${mapping.iso3}), y_offset ${mapping.y_offset}`;
}

function formatSavedMapping(photo) {
  const saved = photo.saved_selection;
  if (!saved) {
    return "Saved in tool: none yet";
  }
  if (saved.is_na) {
    return "Saved in tool: NA (No country mapping)";
  }
  const isoSuffix = saved.country_iso3 ? ` (${saved.country_iso3})` : "";
  const slices = Array.isArray(saved.slice_indexes) && saved.slice_indexes.length
    ? `, slices [${saved.slice_indexes.join(", ")}]`
    : "";
  const yOffsetText = Number.isFinite(Number(saved.y_offset))
    ? `, y_offset ${saved.y_offset}`
    : "";
  return `Saved in tool: ${saved.country_label}${isoSuffix}${yOffsetText}${slices}`;
}

function currentPhoto() {
  return state.photos[state.currentIndex] || null;
}

function savedCount() {
  return state.photos.filter((photo) => photo.saved_selection).length;
}

function firstUntaggedPhotoIndex() {
  return state.photos.findIndex((photo) => !photo.saved_selection);
}

function resolveCountryInput(inputRaw) {
  const value = String(inputRaw || "").trim();
  const normalizedValue = value.toLowerCase();
  if (!value) {
    return {
      countryLabel: "",
      countryIso3: null,
      mode: "none",
      isNA: false
    };
  }

  if (value === NA_OPTION_LABEL || NA_ALIASES.has(normalizedValue)) {
    return {
      countryLabel: "NA",
      countryIso3: "NA",
      mode: "na",
      isNA: true
    };
  }

  if (state.countryByLabel.has(value)) {
    const match = state.countryByLabel.get(value);
    return {
      countryLabel: match.name,
      countryIso3: match.iso3,
      mode: "country-list",
      isNA: false
    };
  }

  const isoCandidate = value.toUpperCase();
  if (state.countryByIso.has(isoCandidate)) {
    const match = state.countryByIso.get(isoCandidate);
    return {
      countryLabel: match.name,
      countryIso3: match.iso3,
      mode: "country-list",
      isNA: false
    };
  }

  const suffixIso = value.match(/\(([A-Za-z]{3})\)\s*$/);
  if (suffixIso) {
    const iso = suffixIso[1].toUpperCase();
    if (state.countryByIso.has(iso)) {
      const match = state.countryByIso.get(iso);
      return {
        countryLabel: match.name,
        countryIso3: match.iso3,
        mode: "country-list",
        isNA: false
      };
    }
  }

  const exactName = state.projectCountries.find(
    (country) => country.name.toLowerCase() === value.toLowerCase()
  );
  if (exactName) {
    return {
      countryLabel: exactName.name,
      countryIso3: exactName.iso3,
      mode: "country-list",
      isNA: false
    };
  }

  return {
    countryLabel: value,
    countryIso3: null,
    mode: "manual",
    isNA: false
  };
}

function canSaveCurrent() {
  const resolved = resolveCountryInput(state.form.countryInput);
  if (!resolved.countryLabel) {
    return false;
  }
  if (resolved.isNA) {
    return true;
  }
  return state.form.sliceIndexes.length > 0;
}

function fillFormFromPhoto(photo) {
  const saved = photo?.saved_selection;
  if (saved) {
    state.form.countryInput = saved.is_na
      ? NA_OPTION_LABEL
      : saved.country_iso3 && state.countryByIso.has(saved.country_iso3)
      ? `${state.countryByIso.get(saved.country_iso3).name} (${saved.country_iso3})`
      : saved.country_label || "";
    state.form.countryIso3 = saved.is_na ? "NA" : saved.country_iso3 || null;
    if (Array.isArray(saved.slice_indexes) && saved.slice_indexes.length) {
      state.form.sliceIndexes = normalizeSliceIndexes(saved.slice_indexes);
    } else if (Number.isInteger(saved.slice_index)) {
      state.form.sliceIndexes = [saved.slice_index];
    } else {
      const nearest = nearestSliceIndex(saved.y_offset);
      state.form.sliceIndexes = Number.isInteger(nearest) ? [nearest] : [];
    }
    return;
  }

  const current = photo?.current_assignment;
  if (current) {
    state.form.countryInput = `${current.country_name} (${current.iso3})`;
    state.form.countryIso3 = current.iso3;
    const nearest = nearestSliceIndex(current.y_offset);
    state.form.sliceIndexes = Number.isInteger(nearest) ? [nearest] : [];
    return;
  }

  state.form.countryInput = "";
  state.form.countryIso3 = null;
  state.form.sliceIndexes = [];
}

function renderSlices(photoPath) {
  els.sliceGrid.innerHTML = "";

  for (const option of SLICE_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    const isSelected = state.form.sliceIndexes.includes(option.index);
    button.className = `slice-btn${isSelected ? " is-selected" : ""}`;
    button.dataset.sliceIndex = String(option.index);

    const preview = document.createElement("div");
    preview.className = "slice-preview";

    const image = document.createElement("img");
    image.src = `/asset/${photoPath}`;
    image.alt = `${option.label} slice preview`;
    image.style.objectPosition = `50% ${option.objectPositionY}`;

    const label = document.createElement("div");
    label.className = "slice-label";
    label.textContent = `${option.label} (y_offset ${option.yOffset})`;

    preview.appendChild(image);
    button.appendChild(preview);
    button.appendChild(label);

    button.addEventListener("click", () => {
      if (state.form.sliceIndexes.includes(option.index)) {
        state.form.sliceIndexes = state.form.sliceIndexes.filter((value) => value !== option.index);
      } else {
        state.form.sliceIndexes = normalizeSliceIndexes([...state.form.sliceIndexes, option.index]);
      }
      render();
    });

    els.sliceGrid.appendChild(button);
  }
}

function render() {
  const total = state.photos.length;
  const done = state.currentIndex >= total;

  els.progressLine.textContent = total
    ? `Photo ${Math.min(state.currentIndex + 1, total)} of ${total} | saved ${savedCount()}`
    : "No photos found in configured folders.";

  els.outputLine.textContent = state.outputFile
    ? `Output JSON: ${state.outputFile}${state.apiVersion ? ` | API v${state.apiVersion}` : ""}`
    : "";

  if (done || total === 0) {
    els.workspace.classList.add("hidden");
    els.donePanel.classList.remove("hidden");
    return;
  }

  els.workspace.classList.remove("hidden");
  els.donePanel.classList.add("hidden");

  const photo = currentPhoto();
  if (!photo) {
    return;
  }

  els.photoPath.textContent = photo.photo_path;
  els.existingMapping.textContent = formatCurrentMapping(photo);
  els.savedMapping.textContent = formatSavedMapping(photo);

  els.fullImage.src = `/asset/${photo.photo_path}`;
  els.fullImage.alt = photo.file_name;

  if (els.countryInput.value !== state.form.countryInput) {
    els.countryInput.value = state.form.countryInput;
  }

  const resolved = resolveCountryInput(state.form.countryInput);
  if (resolved.mode === "country-list") {
    els.countryResolution.textContent = `Selected country: ${resolved.countryLabel} (${resolved.countryIso3})`;
  } else if (resolved.mode === "na") {
    els.countryResolution.textContent = "Selected country: NA (No country mapping).";
  } else if (resolved.mode === "manual") {
    els.countryResolution.textContent = "Manual country entry (not in country list).";
  } else {
    els.countryResolution.textContent = "";
  }

  if (resolved.isNA && state.form.sliceIndexes.length === 0) {
    els.countryResolution.textContent += `${els.countryResolution.textContent ? " " : ""}Crop selection is optional for NA.`;
  } else {
    const averagedOffset = averageYOffsetFromIndexes(state.form.sliceIndexes);
    if (averagedOffset === null) {
      els.countryResolution.textContent += (els.countryResolution.textContent ? " " : "") + "Select one or more slices.";
    } else {
      const selectedText = state.form.sliceIndexes.map((index) => SLICE_OPTIONS[index].label).join(", ");
      els.countryResolution.textContent +=
        `${els.countryResolution.textContent ? " " : ""}Slices: ${selectedText}. Average y_offset: ${averagedOffset}.`;
    }
  }

  renderSlices(photo.photo_path);

  els.prevBtn.disabled = state.saving || state.currentIndex === 0;
  els.nextBtn.disabled = state.saving || !canSaveCurrent();
  els.nextBtn.textContent = state.saving ? "Saving..." : "Save + Next";
}

async function saveCurrentAndAdvance() {
  if (state.saving) {
    return;
  }

  const photo = currentPhoto();
  if (!photo) {
    return;
  }

  const resolved = resolveCountryInput(state.form.countryInput);
  if (!resolved.countryLabel) {
    return;
  }

  const sliceIndexes = normalizeSliceIndexes(state.form.sliceIndexes);
  if (!resolved.isNA && !sliceIndexes.length) {
    return;
  }
  const averagedYOffset = averageYOffsetFromIndexes(sliceIndexes);

  state.saving = true;
  render();
  setError("");

  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        photo_path: photo.photo_path,
        country_iso3: resolved.countryIso3,
        country_label: resolved.countryLabel,
        y_offset: averagedYOffset,
        slice_indexes: sliceIndexes,
        is_na: resolved.isNA
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload?.error || "Failed to save selection");
    }

    photo.saved_selection = payload.saved;

    if (state.currentIndex < state.photos.length - 1) {
      state.currentIndex += 1;
      fillFormFromPhoto(currentPhoto());
    } else {
      state.currentIndex = state.photos.length;
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to save");
  } finally {
    state.saving = false;
    render();
  }
}

function initializeEvents() {
  els.countryInput.addEventListener("input", (event) => {
    state.form.countryInput = event.target.value;
    const resolved = resolveCountryInput(state.form.countryInput);
    state.form.countryIso3 = resolved.countryIso3;
    render();
  });

  els.prevBtn.addEventListener("click", () => {
    if (state.currentIndex <= 0 || state.saving) {
      return;
    }
    state.currentIndex -= 1;
    fillFormFromPhoto(currentPhoto());
    setError("");
    render();
  });

  els.nextBtn.addEventListener("click", () => {
    void saveCurrentAndAdvance();
  });
}

function hydrateCountryDatalist() {
  els.countryOptions.innerHTML = "";
  state.countryByLabel.clear();
  state.countryByIso.clear();

  const naOption = document.createElement("option");
  naOption.value = NA_OPTION_LABEL;
  els.countryOptions.appendChild(naOption);

  for (const country of state.projectCountries) {
    const label = `${country.name} (${country.iso3})`;
    state.countryByLabel.set(label, country);
    state.countryByIso.set(country.iso3, country);

    const option = document.createElement("option");
    option.value = label;
    els.countryOptions.appendChild(option);
  }
}

async function bootstrap() {
  setError("");
  try {
    const response = await fetch("/api/bootstrap");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload?.error || "Failed to load bootstrap data");
    }

    state.photos = Array.isArray(payload.photos) ? payload.photos : [];
    state.projectCountries = Array.isArray(payload.countries)
      ? payload.countries
      : Array.isArray(payload.project_countries)
        ? payload.project_countries
        : [];
    state.outputFile = payload.output_file || "";
    state.apiVersion = Number.isFinite(Number(payload.api_version)) ? Number(payload.api_version) : null;

    const resumeIndex = firstUntaggedPhotoIndex();
    state.currentIndex = resumeIndex === -1 ? state.photos.length : resumeIndex;

    hydrateCountryDatalist();
    fillFormFromPhoto(currentPhoto());
    render();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Bootstrap failed");
  }
}

initializeEvents();
void bootstrap();
