import { useEffect, useState } from "react";
import { SiteHeader } from "./app/site-header";
import { UiShell } from "./app/ui-shell";
import { DashboardPage } from "./app/dashboard-page";
import { CreativePitchPage } from "./app/creative-pitch-page";
import { HomePage } from "./app/home-page";
import { OurFilmsPage } from "./app/our-films-page";

const creativePitchEnabled = import.meta.env.VITE_ENABLE_CREATIVE_PITCH !== "false";

const baseTabs = [
  { key: "home", label: "Home" },
  { key: "impact", label: "Tenure Facility" },
  { key: "films", label: "Our Films" }
];
const primaryTabs = creativePitchEnabled
  ? [...baseTabs.slice(0, 2), { key: "creative_pitch", label: "Creative Pitch" }, ...baseTabs.slice(2)]
  : baseTabs;

export default function App() {
  const [activePage, setActivePage] = useState("home");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activePage]);

  useEffect(() => {
    if (!creativePitchEnabled && activePage === "creative_pitch") {
      setActivePage("home");
      return;
    }
    if (activePage === "evolution") {
      setActivePage("home");
      return;
    }
    if (activePage === "films2") {
      setActivePage("films");
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
        {activePage === "home" ? (
          <HomePage onNavigate={setActivePage} creativePitchEnabled={creativePitchEnabled} />
        ) : null}
        {activePage === "impact" ? <DashboardPage /> : null}
        {creativePitchEnabled && activePage === "creative_pitch" ? <CreativePitchPage /> : null}
        {activePage === "films" ? <OurFilmsPage /> : null}
      </main>
    </>
  );
}
