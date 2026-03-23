import { ThematicsBrowser } from "@/components/thematics-browser";
import { getThemes } from "@/lib/content";

export default async function ThematicsPage() {
  const themes = await getThemes();
  return <ThematicsBrowser themes={themes} />;
}
