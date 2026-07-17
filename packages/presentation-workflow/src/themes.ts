import type { ThemeId, ThemeOverrides } from "./contracts.js";

export const SLIDE = { width: 960, height: 540 } as const;

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  headingFont: string;
  bodyFont: string;
  margin: number;
  gap: number;
  radius: number;
  titleSize: number;
  bodySize: number;
  captionSize: number;
}

export interface ThemeTypography {
  displaySize: number;
  leadSize: number;
  detailSize: number;
  titleLineSpacing: number;
  bodyLineSpacing: number;
  compactLineSpacing: number;
  paragraphGap: number;
  minimumAutoFitScale: number;
  ranges: {
    display: readonly [number, number];
    title: readonly [number, number];
    lead: readonly [number, number];
    body: readonly [number, number];
    detail: readonly [number, number];
    metadata: readonly [number, number];
  };
}

const TYPOGRAPHY_RANGES = {
  display: [46, 60], title: [34, 40], lead: [24, 30], body: [18, 22], detail: [15, 18], metadata: [9, 11],
} as const;

const THEMES: Record<ThemeId, ThemeTokens> = {
  "clean-business": {
    id: "clean-business", name: "Clean Business", background: "F7F8FA", surface: "FFFFFF",
    text: "172033", muted: "647083", accent: "2457D6", accent2: "11A683",
    headingFont: "Aptos Display", bodyFont: "Aptos", margin: 54, gap: 18, radius: 0,
    titleSize: 36, bodySize: 19, captionSize: 10,
  },
  "swiss-grid": {
    id: "swiss-grid", name: "Swiss Grid", background: "F4F1EA", surface: "FFFFFF",
    text: "111111", muted: "5F5A50", accent: "E6402B", accent2: "111111",
    headingFont: "Arial", bodyFont: "Arial", margin: 48, gap: 16, radius: 0,
    titleSize: 38, bodySize: 19, captionSize: 10,
  },
  "editorial-story": {
    id: "editorial-story", name: "Editorial Story", background: "FBF7F0", surface: "FFFDFC",
    text: "2B2118", muted: "766A5E", accent: "A33C2E", accent2: "236A73",
    headingFont: "Georgia", bodyFont: "Aptos", margin: 58, gap: 22, radius: 4,
    titleSize: 36, bodySize: 20, captionSize: 10,
  },
};

const TYPOGRAPHY: Record<ThemeId, ThemeTypography> = {
  "clean-business": {
    displaySize: 52, leadSize: 27, detailSize: 16,
    titleLineSpacing: 0.98, bodyLineSpacing: 1.14, compactLineSpacing: 1.06,
    paragraphGap: 5, minimumAutoFitScale: 0.9,
    ranges: TYPOGRAPHY_RANGES,
  },
  "swiss-grid": {
    displaySize: 54, leadSize: 28, detailSize: 16,
    titleLineSpacing: 0.94, bodyLineSpacing: 1.1, compactLineSpacing: 1.04,
    paragraphGap: 4, minimumAutoFitScale: 0.9,
    ranges: TYPOGRAPHY_RANGES,
  },
  "editorial-story": {
    displaySize: 48, leadSize: 27, detailSize: 17,
    titleLineSpacing: 0.98, bodyLineSpacing: 1.18, compactLineSpacing: 1.08,
    paragraphGap: 6, minimumAutoFitScale: 0.9,
    ranges: TYPOGRAPHY_RANGES,
  },
};

export function getTheme(id: ThemeId): ThemeTokens {
  return THEMES[id];
}

export function getTypography(id: ThemeId): ThemeTypography {
  return TYPOGRAPHY[id];
}

export function resolveTheme(id: ThemeId, overrides?: ThemeOverrides): ThemeTokens {
  const base = THEMES[id];
  if (!overrides) return base;
  return {
    ...base,
    ...(overrides.colors ?? {}),
    headingFont: overrides.fonts?.heading ?? base.headingFont,
    bodyFont: overrides.fonts?.body ?? base.bodyFont,
  };
}
