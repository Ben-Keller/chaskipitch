import { StoryExperience } from "../components/story-experience";
import { LoadingPanel, ErrorPanel } from "../components/loading-panel";
import { getCreativePitchStory } from "../lib/content";
import { withBasePath } from "../lib/paths";
import { useAsyncData } from "../lib/use-async-data";

function withAssetPrefix(pathValue) {
  if (typeof pathValue !== "string" || !pathValue.startsWith("/assets/")) {
    return pathValue;
  }
  return withBasePath(pathValue.replace("/assets/", "creative-pitch/assets/"));
}

function normalizeLayer(layer) {
  if (!layer || typeof layer !== "object") {
    return layer;
  }

  const normalized = {
    ...layer,
    assetPath: withAssetPrefix(layer.assetPath),
    reducedMotionAsset: withAssetPrefix(layer.reducedMotionAsset)
  };

  if (layer.sequence && typeof layer.sequence === "object") {
    normalized.sequence = {
      ...layer.sequence,
      srcPattern: withAssetPrefix(layer.sequence.srcPattern)
    };
  }

  return normalized;
}

function normalizeStory(story) {
  return {
    ...story,
    scenes: (story?.scenes ?? []).map((scene) => ({
      ...scene,
      layers: (scene?.layers ?? []).map(normalizeLayer)
    }))
  };
}

export function CreativePitchPage() {
  const { loading, error, data } = useAsyncData(async () => getCreativePitchStory(), []);

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
