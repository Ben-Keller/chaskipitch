import { useCallback } from "react";
import { StoryExperience } from "./story-experience";
import { LoadingPanel, ErrorPanel } from "./loading-panel";
import { getCreativePitchStory } from "./content";
import { withBasePath } from "./paths";
import { useAsyncData } from "./use-async-data";

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
    scenes: (story?.scenes ?? []).map((scene) => ({
      ...scene,
      media: scene?.media
        ? {
            ...scene.media,
            srcPattern: withAssetPrefix(scene.media.srcPattern)
          }
        : null,
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
