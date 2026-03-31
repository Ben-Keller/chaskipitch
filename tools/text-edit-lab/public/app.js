const els = {
  workspace: document.getElementById("workspace"),
  progressLine: document.getElementById("progress-line"),
  summaryLine: document.getElementById("summary-line"),
  outputLine: document.getElementById("output-line"),
  errorPanel: document.getElementById("error-panel"),
  entryId: document.getElementById("entry-id"),
  entryFile: document.getElementById("entry-file"),
  entryLocator: document.getElementById("entry-locator"),
  originalText: document.getElementById("original-text"),
  editableText: document.getElementById("editable-text"),
  dirtyLine: document.getElementById("dirty-line"),
  prevBtn: document.getElementById("prev-btn"),
  saveNextBtn: document.getElementById("save-next-btn")
};

const state = {
  entries: [],
  outputFile: "",
  summary: { total: 0, remaining: 0, completed: 0 },
  currentIndex: 0,
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

function currentEntry() {
  return state.entries[state.currentIndex] || null;
}

function formatLocator(entry) {
  const line = entry?.locator?.line;
  const column = entry?.locator?.column;
  if (Number.isFinite(line) && Number.isFinite(column)) {
    return `line ${line}, col ${column}`;
  }
  if (Number.isFinite(line)) {
    return `line ${line}`;
  }
  return "";
}

function refreshDirtyState() {
  const entry = currentEntry();
  if (!entry) {
    els.dirtyLine.textContent = "";
    return;
  }
  const currentValue = els.editableText.value;
  if (currentValue === String(entry.new_text ?? "")) {
    els.dirtyLine.textContent = "Saved value loaded.";
  } else {
    els.dirtyLine.textContent = "Unsaved changes in editor.";
  }
}

function renderProgress() {
  const total = state.entries.length;
  const current = total ? state.currentIndex + 1 : 0;
  els.progressLine.textContent = `Entry ${current}/${total}`;
  els.summaryLine.textContent = `Completed ${state.summary.completed} | Remaining ${state.summary.remaining}`;
  els.outputLine.textContent = state.outputFile ? `File: ${state.outputFile}` : "";
}

function renderEntry() {
  const entry = currentEntry();
  if (!entry) {
    els.entryId.textContent = "No entries";
    els.entryFile.textContent = "";
    els.entryLocator.textContent = "";
    els.originalText.value = "";
    els.editableText.value = "";
    return;
  }

  els.entryId.textContent = `id: ${entry.id}`;
  els.entryFile.textContent = `file: ${entry.file}`;
  const locator = formatLocator(entry);
  els.entryLocator.textContent = locator ? `locator: ${locator}` : "";
  els.originalText.value = String(entry.text ?? "");
  els.editableText.value = String(entry.new_text ?? "");
  refreshDirtyState();
}

function renderActions() {
  const hasEntry = Boolean(currentEntry());
  els.prevBtn.disabled = !hasEntry || state.currentIndex <= 0 || state.saving;
  els.saveNextBtn.disabled = !hasEntry || state.saving;
  els.saveNextBtn.textContent = state.saving ? "Saving..." : "Save + Next";
}

function render() {
  renderProgress();
  renderEntry();
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
  state.entries = Array.isArray(payload.entries) ? payload.entries : [];
  state.outputFile = String(payload.output_file || "");
  state.summary = payload.summary || state.summary;
  state.currentIndex = Number.isInteger(payload.first_pending_index)
    ? Math.max(0, Math.min(payload.first_pending_index, Math.max(state.entries.length - 1, 0)))
    : 0;
}

async function saveCurrent(andAdvance) {
  const entry = currentEntry();
  if (!entry) {
    return;
  }
  const nextText = els.editableText.value;

  try {
    setError("");
    state.saving = true;
    renderActions();

    const payload = await fetchJson("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entry.id,
        new_text: nextText
      })
    });

    entry.new_text = nextText;
    state.outputFile = payload.output_file || state.outputFile;
    state.summary = payload.summary || state.summary;

    if (andAdvance && state.currentIndex < state.entries.length - 1) {
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

  els.editableText.addEventListener("input", () => {
    refreshDirtyState();
  });

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!els.saveNextBtn.disabled) {
        saveCurrent(true);
      }
    }
  });
}

async function main() {
  try {
    setError("");
    await loadBootstrap();
    els.workspace.classList.remove("hidden");
    render();
    registerEvents();
  } catch (error) {
    setError(error?.message || String(error));
  }
}

main();
