"use client";

import { useEffect } from "react";

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value, 16);
  return `${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255}`;
}

function rgba(hex: string, opacity: number) {
  return `rgba(${hexToRgb(hex).replaceAll(" ", ",")}, ${opacity})`;
}

export function PortalHeaderTheme({ color, opacity, outerBackgroundColor, fontColor }: { color: string; opacity: number; outerBackgroundColor: string; fontColor: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--portal-header-background", rgba(color, opacity));
    root.style.setProperty("--portal-header-glow", rgba(color, Math.min(0.35, opacity * 0.55)));
    document.body.style.backgroundColor = outerBackgroundColor;
    document.body.style.color = fontColor;
    return () => {
      root.style.removeProperty("--portal-header-background");
      root.style.removeProperty("--portal-header-glow");
      document.body.style.removeProperty("background-color");
      document.body.style.removeProperty("color");
    };
  }, [color, opacity]);

  return null;
}
