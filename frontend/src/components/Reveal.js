"use client";

import { motion, useReducedMotion } from "motion/react";

// A small entrance for sections as they come into view. Deliberately restrained:
// style.md §1.4 says motion is a lift, not a performance — 16px and half a second,
// once, and nothing at all for anyone who asked for less movement.

export default function Reveal({ delay = 0, className = "", children }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
