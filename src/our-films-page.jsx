import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withBasePath } from "./paths";

const FILMS = [
  {
    id: "wind-within-you",
    title: "The Wind is Within You",
    subtitle: "Kogi Land Reclamation",
    vimeoId: "910246717",
    embed: "https://player.vimeo.com/video/910246717?h=66fc752da1",
    poster: "films/kogi-land-reclamation.png",
    titleClass: "films2-title-font--kogi",
    description:
      "A grounded story of territory recovery and Indigenous leadership. It directly supports this proposal by showing how land rights are lived in practice, not only documented in policy language."
  },
  {
    id: "pitukiska",
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
    id: "undp60",
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
    id: "sustainable-energy-platform",
    title: "UNDP Sustainable Energy Digital Intelligence Platform",
    subtitle: "Data Systems for Inclusive Energy Planning",
    vimeoId: "1098670116",
    embed: "https://player.vimeo.com/video/1098670116?h=0155e6c87d",
    poster: "films/sustainable-energy.png",
    titleClass: "films2-title-font--undp",
    description:
      "A systems-focused piece on digital infrastructure for energy access and planning. For this proposal, it demonstrates how clear data architecture and visual storytelling can support policy alignment and implementation at scale."
  },
  {
    id: "floating-islands",
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
    id: "sunflower-kids",
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
const SHARED_FILM_TITLE_CLASS = "films2-title-font--sunflower";
const VIMEO_PLAYER_ORIGIN = "https://player.vimeo.com";

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
  const hoverActivationDelayMs = 180;
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingIndex, setPlayingIndex] = useState(null);
  const [videoModeIndex, setVideoModeIndex] = useState(null);
  const [loadedPlayers, setLoadedPlayers] = useState(
    () => new Set(FILMS.map((_, index) => index))
  );
  const [readyPlayers, setReadyPlayers] = useState(() => new Set());
  const [pendingPlayIndex, setPendingPlayIndex] = useState(null);
  const iframeRefs = useRef([]);
  const hoverTimerRef = useRef(null);

  const filmsWithPlayerUrls = useMemo(
    () =>
      FILMS.map((film, index) => ({
        ...film,
        titleClass: SHARED_FILM_TITLE_CLASS,
        playerId: toPlayerId(index),
        embedWithApi: buildVimeoEmbedUrl(film.embed, index),
        posterUrl: film.poster ? withBasePath(film.poster) : ""
      })),
    []
  );

  const accordionVars = useMemo(() => {
    const count = filmsWithPlayerUrls.length;
    const sidePad = 2;
    const cardWidth = count >= 6 ? 76 : 80;
    const denominator = Math.max(count - 1, 1);
    const xStep = (100 - sidePad * 2 - cardWidth) / denominator;
    const sliceTitleCenter = (xStep * 50) / cardWidth;
    return {
      "--films2-count": String(count),
      "--films2-card-width": `${cardWidth}%`,
      "--films2-x-step": `${xStep}%`,
      "--films2-side-pad": `${sidePad}%`,
      "--films2-slice-title-center": `${sliceTitleCenter}%`
    };
  }, [filmsWithPlayerUrls.length]);

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

  const clearHoverActivation = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const scheduleHoverActivation = useCallback(
    (index) => {
      clearHoverActivation();
      hoverTimerRef.current = window.setTimeout(() => {
        setActiveIndex(index);
        ensurePlayerLoaded(index);
        hoverTimerRef.current = null;
      }, hoverActivationDelayMs);
    },
    [clearHoverActivation, ensurePlayerLoaded]
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
    return () => {
      clearHoverActivation();
    };
  }, [clearHoverActivation]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== VIMEO_PLAYER_ORIGIN) {
        return;
      }
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
    <div className="page-grid films2-page">
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
        style={accordionVars}
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
                scheduleHoverActivation(index);
              }}
              onMouseLeave={() => {
                clearHoverActivation();
              }}
              onFocus={() => {
                clearHoverActivation();
                setActiveIndex(index);
                ensurePlayerLoaded(index);
              }}
              onBlur={() => {
                clearHoverActivation();
              }}
              onClick={() => {
                clearHoverActivation();
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

              <div
                className={`films2-panel__content ${film.titleClass}`}
                aria-hidden={isPlaying || isVideoVisible}
              >
                <p>{film.subtitle}</p>
                <h2>{film.title}</h2>
                <p>{film.description}</p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
