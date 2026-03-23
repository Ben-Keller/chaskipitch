"use client";

import { AnimatePresence, motion } from "framer-motion";

type TransitionPhase = "approach" | "descend";

interface CloudTransitionProps {
  active: boolean;
  phase?: TransitionPhase;
  fixed?: boolean;
}

export function CloudTransition({ active, phase = "descend", fixed = false }: CloudTransitionProps) {
  const className = `cloud-overlay cloud-overlay--${phase}${fixed ? " cloud-overlay--fixed" : ""}`;

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className={className}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: phase === "approach" ? 1.08 : 1.18 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          aria-hidden="true"
        >
          <motion.div
            className="cloud-overlay__layer cloud-overlay__layer--back"
            animate={{ x: phase === "approach" ? ["-3%", "2%", "-1%"] : ["0%", "-2%", "1%"] }}
            transition={{ duration: 2.1, ease: "easeInOut" }}
          />
          <motion.div
            className="cloud-overlay__layer cloud-overlay__layer--mid"
            animate={{ y: phase === "approach" ? ["-2%", "1%", "0%"] : ["0%", "-1%", "1%"] }}
            transition={{ duration: 1.9, ease: "easeInOut" }}
          />
          <motion.div
            className="cloud-overlay__layer cloud-overlay__layer--front"
            animate={{ scale: phase === "approach" ? [1, 1.06, 1.02] : [1, 1.12, 1.08] }}
            transition={{ duration: 1.7, ease: "easeInOut" }}
          />
          <div className="cloud-overlay__grain" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
