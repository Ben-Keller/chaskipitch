import { CountryExplorer } from "../components/country-explorer";
import { LoadingPanel, ErrorPanel } from "../components/loading-panel";
import { getCountries } from "../lib/content";
import { useAsyncData } from "../lib/use-async-data";

export function CountriesPage({ onCountrySelect }) {
  const { loading, error, data } = useAsyncData(() => getCountries(), []);

  if (loading) {
    return <LoadingPanel label="Loading countries..." />;
  }

  if (error || !data) {
    return <ErrorPanel message="Unable to load country explorer." />;
  }

  return <CountryExplorer countries={data} onCountrySelect={onCountrySelect} />;
}
