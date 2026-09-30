"use client";

import { useEffect, useState } from "react";

// Decorative floating hearts behind all content. Deterministic positions (no hydration mismatch),
// pointer-events disabled, hidden for users who prefer reduced motion (see globals.css).
const FLOAT = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 6.7 + 2) % 100,
  delay: (i * 1.9) % 16,
  duration: 16 + (i % 5) * 3,
  size: 12 + (i % 4) * 7,
}));

export function FloatingHearts() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {FLOAT.map((h, i) => (
        <span key={i} className="heart-float" style={{ left: `${h.left}%`, animationDelay: `${h.delay}s`, animationDuration: `${h.duration}s`, fontSize: h.size }}>
          ♥
        </span>
      ))}
    </div>
  );
}

// A one-shot burst of hearts from the middle of the screen.
export function HeartBurst({ fire }: { fire: boolean }) {
  const [shots, setShots] = useState(0);
  useEffect(() => {
    if (fire) setShots((n) => n + 1);
  }, [fire]);
  if (!fire || shots === 0) return null;
  const parts = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    const r = 110 + (i % 4) * 45;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r - 60, r: (i % 2 ? 1 : -1) * (10 + (i % 5) * 6), d: (i % 6) * 0.04, s: 16 + (i % 4) * 8 };
  });
  return (
    <div key={shots} aria-hidden="true" className="pointer-events-none fixed left-1/2 top-1/2 z-50">
      {parts.map((p, i) => (
        <span
          key={i}
          className="heart-pop"
          style={{ ["--x" as string]: `${p.x}px`, ["--y" as string]: `${p.y}px`, ["--r" as string]: `${p.r}deg`, animationDelay: `${p.d}s`, fontSize: p.s } as React.CSSProperties}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
