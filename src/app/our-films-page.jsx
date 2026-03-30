import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withBasePath } from "../lib/paths";
import { usePageColorControls } from "../lib/page-color-controls";
import { ColorControlOverlay } from "./color-control-overlay";

const FILMS = [
  {
    title: "The Wind is Within You",
    subtitle: "Kogi Land Reclamation",
    vimeoId: "1098670116",
    embed: "https://player.vimeo.com/video/1098670116?h=0155e6c87d",
    poster: "films/kogi-land-reclamation.png",
    titleClass: "films2-title-font--kogi",
    description:
      "A grounded story of territory recovery and Indigenous leadership. It directly supports this proposal by showing how land rights are lived in practice, not only documented in policy language."
  },
  {
    title: "Pitukiska",
    subtitle: "The Andean New Year",
    vimeoId: "470478889",
    embed: "https://player.vimeo.com/video/470478889?h=44622bc319",
    poster: "films/pitukiska-andean-new-year.png",
    titleClass: "films2-title-font--andean",
    description:
      "Centers cultural continuity, ceremony, and intergenerational memory. For this project, it reinforces why tenure work must protect both territory and the knowledge systems tied to it."
  },
  {
    title: "UNDP60",
    subtitle: "Celebrating 60 Years of UNDP",
    vimeoId: "1178401210",
    embed: "https://player.vimeo.com/video/1178401210?h=a8d35734b2",
    poster: "films/undp60.png",
    titleClass: "films2-title-font--undp",
    description:
      "Demonstrates institutional storytelling at scale and clear impact communication. It is relevant to this proposal’s funding narrative and the need to translate complex outcomes for decision-makers."
  },
  {
    title: "Floating Islands",
    subtitle: "Lake Titicaca, Peru",
    vimeoId: "470476203",
    embed: "https://player.vimeo.com/video/470476203?h=18b362ab18",
    poster: "films/floating-islands.png",
    titleClass: "films2-title-font--floating",
    description:
      "Highlights the relationship between ecological adaptation and local governance in a fragile landscape. This aligns with the proposal’s climate-and-tenure lens in Andean and Amazonian contexts."
  },
  {
    title: "Sunflower Kids",
    subtitle: "Solar Education in Lesotho",
    vimeoId: "869911767",
    embed: "https://player.vimeo.com/video/869911767?h=84c870c40b",
    poster: "films/sunflower-kids.png",
    titleClass: "films2-title-font--sunflower",
    description:
      "Shows community-centered development through youth, learning, and practical infrastructure. It connects to the proposal’s emphasis on long-term capacity, inclusion, and locally led change."
  }
];

function toPlayerId(index) {
  return `films2-player-${index}`;
}

function buildVimeoEmbedUrl(rawUrl, index) {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("api", "1");
    parsed.searchParams.set("player_id", toPlayerId(index));
    parsed.searchParams.set("dnt", "1");
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function OurFilmsPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingIndex, setPlayingIndex] = useState(null);
  const [videoModeIndex, setVideoModeIndex] = useState(null);
  const [loadedPlayers, setLoadedPlayers] = useState(
    () => new Set(FILMS.map((_, index) => index))
  );
  const [readyPlayers, setReadyPlayers] = useState(() => new Set());
  const [pendingPlayIndex, setPendingPlayIndex] = useState(null);
  const iframeRefs = useRef([]);
  const {
    categories,
    selectedThemes,
    styleVars,
    applyThemeCategory,
    resetScope,
    saveControlJson
  } = usePageColorControls("films");

  const filmsWithPlayerUrls = useMemo(
    () =>
      FILMS.map((film, index) => ({
        ...film,
        playerId: toPlayerId(index),
        embedWithApi: buildVimeoEmbedUrl(film.embed, index),
        posterUrl: film.poster ? withBasePath(film.poster) : ""
      })),
    []
  );

  const postPlayerMessage = useCallback((index, payload) => {
    const frame = iframeRefs.current[index];
    if (!frame?.contentWindow) {
      return;
    }
    frame.contentWindow.postMessage(JSON.stringify(payload), "*");
  }, []);

  const initializePlayerListeners = useCallback(
    (index) => {
      postPlayerMessage(index, { method: "addEventListener", value: "play" });
      postPlayerMessage(index, { method: "addEventListener", value: "pause" });
      postPlayerMessage(index, { method: "addEventListener", value: "ended" });
    },
    [postPlayerMessage]
  );

  const ensurePlayerLoaded = useCallback((index) => {
    setLoadedPlayers((current) => {
      if (current.has(index)) {
        return current;
      }
      const next = new Set(current);
      next.add(index);
      return next;
    });
  }, []);

  const handlePlayRequest = useCallback(
    (index) => {
      setActiveIndex(index);
      setVideoModeIndex(index);
      ensurePlayerLoaded(index);

      if (readyPlayers.has(index)) {
        postPlayerMessage(index, { method: "play" });
        return;
      }

      setPendingPlayIndex(index);
    },
    [ensurePlayerLoaded, postPlayerMessage, readyPlayers]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const descriptors = [
      { rel: "preconnect", href: "https://player.vimeo.com" },
      { rel: "preconnect", href: "https://i.vimeocdn.com" },
      { rel: "dns-prefetch", href: "https://player.vimeo.com" },
      { rel: "dns-prefetch", href: "https://i.vimeocdn.com" }
    ];

    const created = [];
    descriptors.forEach(({ rel, href }) => {
      const exists = document.head.querySelector(`link[rel="${rel}"][href="${href}"]`);
      if (exists) {
        return;
      }

      const link = document.createElement("link");
      link.rel = rel;
      link.href = href;
      if (rel === "preconnect") {
        link.crossOrigin = "";
      }
      document.head.appendChild(link);
      created.push(link);
    });

    return () => {
      created.forEach((node) => node.remove());
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      const playerId = String(payload?.player_id ?? "");
      if (!playerId.startsWith("films2-player-")) {
        return;
      }

      const index = Number(playerId.replace("films2-player-", ""));
      if (!Number.isInteger(index) || index < 0 || index >= FILMS.length) {
        return;
      }

      const eventName = payload?.event ?? payload?.method;
      if (eventName === "play") {
        setPlayingIndex(index);
        setActiveIndex(index);
        setVideoModeIndex(index);
      } else if (eventName === "pause" || eventName === "ended") {
        setPlayingIndex((current) => (current === index ? null : current));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    FILMS.forEach((_, index) => {
      if (index !== activeIndex) {
        postPlayerMessage(index, { method: "pause" });
      }
    });

    ensurePlayerLoaded(activeIndex);
    setPlayingIndex((current) => (current !== null && current !== activeIndex ? null : current));
    setVideoModeIndex((current) => (current === activeIndex ? current : null));
  }, [activeIndex, ensurePlayerLoaded, postPlayerMessage]);

  return (
    <div className="page-grid films2-page" style={styleVars}>
      <section className="films2-hero">
        <p className="section-kicker">Aesthetic Voyager Films</p>
        <h1>Our Films</h1>
        <p>
          We curated these films as the strongest editorial precedents for this proposal; together
          they define our filmmaking approach for the Tenure Facility program through trusted local
          perspective, place-based visual language, and narratives that make complex tenure,
          climate, and funding outcomes legible to partners and funders.
        </p>
      </section>

      <section
        className={`films2-accordion${playingIndex !== null ? " is-playing-any" : ""}`}
        aria-label="Curated film references"
        style={{ "--films2-count": String(filmsWithPlayerUrls.length) }}
      >
        {filmsWithPlayerUrls.map((film, index) => {
          const totalFilms = filmsWithPlayerUrls.length;
          const isActive = index === activeIndex;
          const isPlaying = index === playingIndex;
          const isVideoMode = index === videoModeIndex;
          const isVideoVisible = isVideoMode && readyPlayers.has(index);
          const isMutedByPlayback = playingIndex !== null && index !== playingIndex;
          const isLeftSlice = index < activeIndex;
          const isRightSlice = index > activeIndex;
          let panelLayer = 10;
          if (isActive) {
            panelLayer = totalFilms + 30;
          } else if (isLeftSlice) {
            panelLayer = 10 + (index + 1);
          } else if (isRightSlice) {
            panelLayer = 10 + (totalFilms - index);
          }
          return (
            <article
              key={film.title}
              className={[
                "films2-panel",
                isActive ? "is-active" : "",
                isPlaying ? "is-playing" : "",
                isLeftSlice ? "is-left-slice" : "",
                isRightSlice ? "is-right-slice" : "",
                isMutedByPlayback ? "is-muted-by-playback" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              aria-expanded={isActive}
              tabIndex={0}
              onMouseEnter={() => {
                setActiveIndex(index);
                ensurePlayerLoaded(index);
              }}
              onFocus={() => {
                setActiveIndex(index);
                ensurePlayerLoaded(index);
              }}
              onClick={() => {
                setActiveIndex(index);
                ensurePlayerLoaded(index);
              }}
              style={{
                "--films2-stack-index": String(index),
                "--films2-layer": `${panelLayer}`
              }}
            >
              {isActive && !isPlaying ? (
                <button
                  type="button"
                  className="films2-panel__play-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    handlePlayRequest(index);
                  }}
                  aria-label={`Play ${film.title}`}
                >
                  <span className="films2-panel__play-icon" aria-hidden="true" />
                </button>
              ) : null}
              {film.posterUrl ? (
                <img
                  className={`films2-panel__poster${isVideoVisible ? " is-hidden" : ""}`}
                  src={film.posterUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
              {loadedPlayers.has(index) ? (
                <iframe
                  ref={(node) => {
                    iframeRefs.current[index] = node;
                  }}
                  src={`${film.embedWithApi}&autoplay=0`}
                  title={`${film.title} — ${film.subtitle}`}
                  loading="eager"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                  allowFullScreen
                  onLoad={() => {
                    initializePlayerListeners(index);
                    setReadyPlayers((current) => {
                      if (current.has(index)) {
                        return current;
                      }
                      const next = new Set(current);
                      next.add(index);
                      return next;
                    });
                    if (pendingPlayIndex === index) {
                      window.setTimeout(() => {
                        postPlayerMessage(index, { method: "play" });
                      }, 40);
                      setPendingPlayIndex(null);
                    }
                  }}
                />
              ) : null}
              <div className="films2-panel__veil" aria-hidden="true" />

              <div
                className={`films2-panel__rail ${film.titleClass}`}
                aria-hidden={isPlaying || isVideoVisible}
              >
                <span>{film.title}</span>
              </div>

              <div className="films2-panel__content" aria-hidden={isPlaying || isVideoVisible}>
                <p>{film.subtitle}</p>
                <h2>{film.title}</h2>
                <p>{film.description}</p>
              </div>
            </article>
          );
        })}
      </section>

      <ColorControlOverlay
        scope="films"
        categories={categories}
        selectedThemes={selectedThemes}
        onThemeChange={applyThemeCategory}
        onSave={saveControlJson}
        onReset={resetScope}
      />
    </div>
  );
}
