import { HomeDashboard } from "@/components/home-dashboard";
import { getCountries, getGlobalContent, getQuotes, getThemes, getWorldGeo } from "@/lib/content";

interface HomePageProps {
  searchParams?: { focus?: string };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const [globalContent, countries, themes, worldGeo, quotes] = await Promise.all([
    getGlobalContent(),
    getCountries(),
    getThemes(),
    getWorldGeo(),
    getQuotes()
  ]);

  const focusIso = searchParams?.focus?.toUpperCase();

  return (
    <HomeDashboard
      globalContent={globalContent}
      countries={countries}
      themes={themes}
      worldGeo={worldGeo}
      quotes={quotes.quotes}
      focusIso={focusIso}
    />
  );
}
