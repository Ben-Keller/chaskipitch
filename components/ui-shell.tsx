"use client";

import { useEffect, useState } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function UiShell() {
  const [scrollRatio, setScrollRatio] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) {
        setScrollRatio(0);
        return;
      }
      const ratio = clamp(window.scrollY / scrollable, 0, 1);
      setScrollRatio(ratio);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const showBackToTop = scrollRatio > 0.14;

  return (
    <>
      <div className="scroll-progress" aria-hidden="true">
        <span className="scroll-progress__value" style={{ transform: `scaleX(${scrollRatio})` }} />
      </div>
      <button
        type="button"
        className={`back-to-top${showBackToTop ? " back-to-top--visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
      >
        Top
      </button>
    </>
  );
}
