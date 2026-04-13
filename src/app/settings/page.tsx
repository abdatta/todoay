"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, MoonStar } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";
import type { ThemeMode } from "@/lib/types";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

function SettingsScreen() {
  const { ready, setThemeMode, state } = useTodoay();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  const selectedTheme = THEME_OPTIONS.find((option) => option.value === state.themeMode) ?? THEME_OPTIONS[0];

  return (
    <div className="app-shell">
      <PageHeader
        title="Settings"
        icon={<Settings size={30} color="var(--accent-color)" />}
      />

      <section className="card settings-card">
        <label className="settings-row">
          <span className="settings-row-label">
            <MoonStar size={18} color="var(--accent-color)" />
            <span>Dark Mode</span>
          </span>
          <div className="settings-select-shell" ref={menuRef}>
            <button
              type="button"
              className={`settings-select ${isMenuOpen ? "open" : ""}`}
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label="Dark mode preference"
              aria-haspopup="listbox"
              aria-expanded={isMenuOpen}
            >
              {selectedTheme.label}
            </button>

            {isMenuOpen ? (
              <div className="settings-menu" role="listbox" aria-label="Dark mode options">
                {THEME_OPTIONS.map((option) => {
                  const isSelected = option.value === state.themeMode;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`settings-menu-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setThemeMode(option.value as ThemeMode);
                        setIsMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </label>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ClientReady>
      <SettingsScreen />
    </ClientReady>
  );
}
