"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudTransition } from "@/components/cloud-transition";

interface CountryBackButtonProps {
  iso3: string;
}

export function CountryBackButton({ iso3 }: CountryBackButtonProps) {
  const router = useRouter();
  const [animating, setAnimating] = useState(false);

  const handleBack = () => {
    const mobile = window.innerWidth < 760;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      router.push(`/?focus=${iso3}`);
      return;
    }

    setAnimating(true);

    window.setTimeout(
      () => {
        router.push(`/?focus=${iso3}`);
      },
      mobile ? 480 : 920
    );
  };

  return (
    <>
      <button type="button" onClick={handleBack} className="back-button">
        Return to world map
      </button>
      <CloudTransition active={animating} phase="descend" fixed />
    </>
  );
}
