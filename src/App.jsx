import { useEffect, useState } from "react";
import { SiteHeader } from "./components/site-header";
import { UiShell } from "./components/ui-shell";
import { FinancialsPage } from "./pages/financials-page";
import { AboutPage } from "./pages/about-page";
import { DashboardPage } from "./pages/dashboard-page";
import { CreativePitchPage } from "./pages/creative-pitch-page";

const primaryTabs = [
  { key: "impact", label: "Impact" },
  { key: "financials", label: "Financials" },
  { key: "about", label: "About" },
  { key: "creative_pitch", label: "Creative Pitch" }
];

export default function App() {
  const [activePage, setActivePage] = useState("impact");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activePage]);

  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteHeader activePage={activePage} onNavigate={setActivePage} navItems={primaryTabs} />
      <UiShell />
      <main
        className={`site-main${
          activePage === "impact" || activePage === "creative_pitch" ? " site-main--dashboard" : ""
        }`}
      >
        {activePage === "impact" ? <DashboardPage /> : null}
        {activePage === "financials" ? <FinancialsPage /> : null}
        {activePage === "about" ? <AboutPage /> : null}
        {activePage === "creative_pitch" ? <CreativePitchPage /> : null}
      </main>
    </>
  );
}
