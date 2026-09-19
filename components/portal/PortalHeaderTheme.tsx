"use client";

import { useEffect } from "react";

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value, 16);
  return `${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255}`;
}

export function PortalHeaderTheme({ color, opacity }: { color: string; opacity: number }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--portal-header-rgb", hexToRgb(color));
    root.style.setProperty("--portal-header-opacity", String(opacity));
    return () => {
      root.style.removeProperty("--portal-header-rgb");
      root.style.removeProperty("--portal-header-opacity");
    };
  }, [color, opacity]);

  return null;
}
