"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}

/** Counts up (or down) to `value` whenever it changes — slowly. */
export function AnimatedNumber({ value, format, duration = 1.4, className }: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => format(reduceMotion ? value : 0));
  const previous = useRef(reduceMotion ? value : 0);

  useEffect(() => {
    const controls = animate(previous.current, value, {
      duration: reduceMotion ? 0 : duration,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (latest) => setDisplay(format(latest)),
    });
    previous.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  return <span className={cn("tnum", className)}>{display}</span>;
}
