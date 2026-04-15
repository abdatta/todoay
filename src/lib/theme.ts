import type { ThemeMode } from "@/lib/types";

export const THEME_BACKGROUND = {
  dark: "#111110",
  light: "#f5efe6",
} as const satisfies Record<Exclude<ThemeMode, "system">, string>;

export function applyThemeChrome(theme: Exclude<ThemeMode, "system">) {
  const themeColor = THEME_BACKGROUND[theme];

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", themeColor);
  }

  const appleStatusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleStatusBarMeta) {
    appleStatusBarMeta.setAttribute("content", theme === "dark" ? "black-translucent" : "default");
  }
}
