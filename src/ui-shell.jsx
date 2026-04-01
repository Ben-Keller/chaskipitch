import { useEffect, useState } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function UiShell() {
  const [scrollRatio, setScrollRatio] = useState(0);

  useEffect(() => {
    let frameId = 0;

    const updateProgress = () => {
      frameId = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) {
        setScrollRatio((value) => (value === 0 ? value : 0));
        return;
      }
      const ratio = clamp(window.scrollY / scrollable, 0, 1);
      setScrollRatio((value) => (Math.abs(value - ratio) < 0.002 ? value : ratio));
    };

    const scheduleUpdate = () => {
      if (frameId) {
        return;
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <>
      <div className="scroll-progress" aria-hidden="true">
        <span className="scroll-progress__value" style={{ transform: `scaleX(${scrollRatio})` }} />
      </div>
    </>
  );
}
