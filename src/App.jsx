import { useEffect, useState } from "react";
import { SiteHeader } from "./app/site-header";
import { UiShell } from "./app/ui-shell";
import { DashboardPage } from "./app/dashboard-page";
import { CreativePitchPage } from "./app/creative-pitch-page";
import { EvolutionDashboardPage } from "./app/evolution-dashboard-page";

const creativePitchEnabled = import.meta.env.VITE_ENABLE_CREATIVE_PITCH !== "false";

const baseTabs = [
  { key: "impact", label: "Impact" },
  { key: "evolution", label: "Evolution & Finance" }
];
const primaryTabs = creativePitchEnabled
  ? [...baseTabs, { key: "creative_pitch", label: "Creative Pitch" }]
  : baseTabs;

export default function App() {
  const [activePage, setActivePage] = useState("impact");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activePage]);

  useEffect(() => {
    if (!creativePitchEnabled && activePage === "creative_pitch") {
      setActivePage("impact");
    }
  }, [activePage, creativePitchEnabled]);

  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteHeader activePage={activePage} onNavigate={setActivePage} navItems={primaryTabs} />
      <UiShell />
      <main
        className={`site-main${
          activePage === "impact" || (creativePitchEnabled && activePage === "creative_pitch")
            ? " site-main--dashboard"
            : ""
        }`}
      >
        {activePage === "impact" ? <DashboardPage /> : null}
        {activePage === "evolution" ? <EvolutionDashboardPage /> : null}
        {creativePitchEnabled && activePage === "creative_pitch" ? <CreativePitchPage /> : null}
      </main>
    </>
  );
}
