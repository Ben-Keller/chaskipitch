import { useCallback } from "react";
import { StoryExperience } from "./story-experience";
import { LoadingPanel, ErrorPanel } from "./loading-panel";
import { getCreativePitchStory } from "./content";
import { withBasePath } from "./paths";
import { useAsyncData } from "./use-async-data";

const MUSIC_TRACKS = [
  {
    title: "Suelo de Mar",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 01 Suelo de Mar.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Aires de Manglar",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 02 Aires de Manglar.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Bosque Seco",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 03 Bosque Seco.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Extrema Altura",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 10 Extrema Altura.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Desierto del Pacifico",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 05 Desierto del Pacífico.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Selva Montanosa",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 06 Selva Montañosa.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Bosque Nuboso",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 07 Bosque Nuboso.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Valle Sagrado",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 08 Valle Sagrado.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Mil Moray",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 09 Mil Moray.mp3",
      import.meta.url
    ).href
  },
  {
    title: "Extrema Altura",
    src: new URL(
      "../assets/music/[Maribel Tafur] Mater Soundscapes of Peru - 10 Extrema Altura.mp3",
      import.meta.url
    ).href
  }
];

function withAssetPrefix(pathValue) {
  if (typeof pathValue !== "string" || !pathValue.startsWith("/assets/")) {
    return pathValue;
  }
  return withBasePath(pathValue.replace("/assets/", "runtime/creative-pitch/assets/"));
}

function resolveTextStyle(textLayer, textStyles) {
  const styleId = typeof textLayer?.styleId === "string" ? textLayer.styleId.trim() : "";
  if (!styleId) {
    return { ...(textLayer ?? {}) };
  }

  const styleToken = textStyles?.[styleId];
  if (!styleToken || typeof styleToken !== "object") {
    return { ...(textLayer ?? {}) };
  }

  return {
    ...styleToken,
    ...(textLayer ?? {})
  };
}

function normalizeStory(story) {
  const textStyles = story?.textStyles && typeof story.textStyles === "object" ? story.textStyles : {};
  return {
    ...story,
    textStyles,
    introSoundtrack: MUSIC_TRACKS[0],
    resetSoundtrack: MUSIC_TRACKS[0],
    scenes: (story?.scenes ?? []).map((scene, index) => ({
      ...scene,
      media: scene?.media
        ? {
            ...scene.media,
            srcPattern: withAssetPrefix(scene.media.srcPattern)
          }
        : null,
      soundtrack: MUSIC_TRACKS[index % MUSIC_TRACKS.length],
      texts: (scene?.texts ?? []).map((text) => resolveTextStyle(text, textStyles))
    }))
  };
}

export function CreativePitchPage() {
  const loadCreativePitch = useCallback(async () => getCreativePitchStory(), []);
  const { loading, error, data } = useAsyncData(loadCreativePitch);

  if (loading) {
    return <LoadingPanel label="Loading creative pitch..." />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load creative pitch story." />;
  }

  const normalizedStory = normalizeStory(data);

  return (
    <div className="creative-pitch-page">
      <StoryExperience story={normalizedStory} />
    </div>
  );
}
