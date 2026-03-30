import { useCallback, useEffect, useMemo, useState } from "react";
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

const pagePathByKey = {
  home: "/",
  impact: "/tenure-facility",
  creative_pitch: "/creative-pitch",
  films: "/our-films"
};

const redirectAliases = {
  "/home": "/",
  "/impact": "/tenure-facility",
  "/films": "/our-films",
  "/films2": "/our-films",
  "/evolution": "/"
};

function normalizePathname(pathname) {
  const raw = pathname || "/";
  const trimmed = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
  return redirectAliases[trimmed] ?? trimmed;
}

function pageKeyFromPath(pathname) {
  if (pathname === "/tenure-facility") {
    return "impact";
  }
  if (pathname === "/creative-pitch") {
    return "creative_pitch";
  }
  if (pathname === "/our-films") {
    return "films";
  }
  return "home";
}

function isKnownPath(pathname, creativeEnabled) {
  if (pathname === "/" || pathname === "/tenure-facility" || pathname === "/our-films") {
    return true;
  }
  return creativeEnabled && pathname === "/creative-pitch";
}

export default function App() {
  const [activePath, setActivePath] = useState(() => normalizePathname(window.location.pathname));
  const activePage = useMemo(() => pageKeyFromPath(activePath), [activePath]);
  const onNavigate = useCallback((pageKey) => {
    const destination = pagePathByKey[pageKey] ?? "/";
    if (!creativePitchEnabled && destination === "/creative-pitch") {
      return;
    }

    if (destination !== window.location.pathname) {
      window.history.pushState({}, "", destination);
    }
    setActivePath(destination);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActivePath(normalizePathname(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let resolved = normalizePathname(activePath);
    if (!creativePitchEnabled && resolved === "/creative-pitch") {
      resolved = "/";
    } else if (!isKnownPath(resolved, creativePitchEnabled)) {
      resolved = "/";
    }

    if (window.location.pathname !== resolved) {
      window.history.replaceState({}, "", resolved);
    }
    if (activePath !== resolved) {
      setActivePath(resolved);
    }
  }, [activePath]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activePath]);

  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteHeader activePage={activePage} onNavigate={onNavigate} navItems={primaryTabs} />
      <UiShell />
      <main
        className={`site-main${
          activePage === "impact" || activePage === "creative_pitch"
            ? " site-main--dashboard"
            : ""
        }`}
      >
        {activePage === "home" ? (
          <HomePage onNavigate={onNavigate} creativePitchEnabled={creativePitchEnabled} />
        ) : null}
        {activePage === "impact" ? <DashboardPage /> : null}
        {creativePitchEnabled && activePage === "creative_pitch" ? <CreativePitchPage /> : null}
        {activePage === "films" ? <OurFilmsPage /> : null}
      </main>
    </>
  );
}
