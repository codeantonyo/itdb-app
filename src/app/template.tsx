"use client";

import { motion } from "framer-motion";

/**
 * Page transition applied to every route. `template.tsx` remounts per
 * navigation, giving each page a slow, weighted settle — no bounce.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
