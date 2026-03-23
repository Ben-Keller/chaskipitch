import { CountryExplorer } from "@/components/country-explorer";
import { getCountries } from "@/lib/content";

export default async function CountriesPage() {
  const countries = await getCountries();
  return <CountryExplorer countries={countries} />;
}
