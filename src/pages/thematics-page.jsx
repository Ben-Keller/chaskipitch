import { ThematicsBrowser } from "../components/thematics-browser";
import { LoadingPanel, ErrorPanel } from "../components/loading-panel";
import { getThemes } from "../lib/content";
import { useAsyncData } from "../lib/use-async-data";

export function ThematicsPage({ onThemeSelect }) {
  const { loading, error, data } = useAsyncData(() => getThemes(), []);

  if (loading) {
    return <LoadingPanel label="Loading thematic views..." />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load themes." />;
  }

  return <ThematicsBrowser themes={data} onThemeSelect={onThemeSelect} />;
}
