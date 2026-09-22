"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Wordmark from "@/components/Wordmark";

const SEEN_KEY = "primer:splash";
const WIPE_SECONDS = 0.9;
const HOLD_SECONDS = 0.55;
const MAX_SPLASH_MS = 2600;

// The wordmark wipes in from the left, holds for a beat, and the whole sheet lifts
// away. Shown once per tab session — a splash you cannot get past is a toll booth.
//
// The overlay is in the server HTML already, opaque, so a first-time visitor never
// sees the hero flash behind it. useLayoutEffect then decides, before the browser
// paints, whether this visit gets the animation at all; someone returning sees at
// most one frame of a paper-coloured sheet over a paper-coloured page.

export default function Splash() {
  const [phase, setPhase] = useState("pending");

  // Reading sessionStorage and matchMedia is exactly the "synchronize with an external
  // system" case effects exist for, and it has to land before the first paint or a
  // returning visitor sees the sheet flash. The lint rule cannot tell that apart from a
  // derived-state mistake, so it is waived here and only here.
  useLayoutEffect(() => {
    const seen = sessionStorage.getItem(SEEN_KEY) === "1";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (seen || reduceMotion) {
      sessionStorage.setItem(SEEN_KEY, "1");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("done");
      return;
    }

    setPhase("playing");
  }, []);

  // Keyed to the phase, not to the component. Splash itself never unmounts — only the
  // sheet inside it does — so a cleanup hung off mount would leave the page locked.
  useEffect(() => {
    if (phase !== "playing") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  // A sheet that covers the page and holds the scroll must not depend on one animation
  // callback firing. If the wipe never reports finishing, lift it anyway.
  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setTimeout(() => setPhase("gone"), MAX_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <>
      {/* Without JS the sheet would never lift, and the page would be unreachable. */}
      <noscript>
        <style>{`[data-splash]{display:none !important}`}</style>
      </noscript>

      <AnimatePresence>
        {phase !== "gone" && (
          <motion.div
            data-splash=""
            // Nothing here is content: screen readers should land on the page itself.
            aria-hidden="true"
            inert
            className="fixed inset-0 z-[100] flex items-center justify-center bg-paper px-6"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[820px]
                         -translate-x-1/2 -translate-y-1/2 rounded-full
                         bg-[radial-gradient(circle_at_center,rgba(220,233,255,0.9),rgba(247,247,243,0)_68%)]"
            />

            <span className="relative inline-flex items-center">
              <motion.span
                className="inline-flex"
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={phase === "playing" ? { clipPath: "inset(0 0% 0 0)" } : undefined}
                transition={{ duration: WIPE_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                onAnimationComplete={() => {
                  sessionStorage.setItem(SEEN_KEY, "1");
                  window.setTimeout(() => setPhase("gone"), HOLD_SECONDS * 1000);
                }}
              >
                <Wordmark size="lg" />
              </motion.span>

              {/* Rides the trailing edge of the wipe: the clip reveals 0%→100% of the
                  wordmark's width, so the caret travels the same 0%→100% on the same
                  curve and the two stay locked together. Then it blinks twice. */}
              <motion.span
                className="absolute inset-y-0 my-auto ml-1 block h-[34px] w-[3px] bg-accent
                           sm:ml-1.5 sm:h-[52px] sm:w-[4px] lg:h-[62px]"
                initial={{ left: "0%" }}
                animate={phase === "playing" ? { left: "100%" } : undefined}
                transition={{ duration: WIPE_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ animation: `caret-blink 0.85s ${WIPE_SECONDS}s 2 step-end` }}
              />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
