"use client";

import { Settings, Database, CalendarDays, FolderOpen } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";

function SettingsScreen() {
  const { ready, state } = useTodoay();

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  const taskDates = Object.keys(state.todosByDate).length;
  const noteDates = Object.keys(state.noteIdsByDate).length;
  const noteCount = Object.keys(state.noteDocs).length;
  const miscCount = state.undatedEntries.length;

  return (
    <div className="app-shell">
      <PageHeader
        title="Settings"
        icon={<Settings size={30} color="var(--accent-color)" />}
      />

      <div className="section-grid">
        <section className="card panel-stack">
          <div className="inline-toolbar">
            <Database size={18} color="var(--accent-color)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem" }}>Storage Overview</h2>
          </div>
          <div className="summary-grid">
            <div className="card summary-card">
              <span className="summary-number">{taskDates}</span>
              <span className="helper-text">Dates with tasks</span>
            </div>
            <div className="card summary-card">
              <span className="summary-number">{noteCount}</span>
              <span className="helper-text">Saved notes</span>
            </div>
            <div className="card summary-card">
              <span className="summary-number">{miscCount}</span>
              <span className="helper-text">Misc entries</span>
            </div>
          </div>
          <p className="helper-text">All content is currently stored in this browser via local storage.</p>
        </section>

        <section className="card panel-stack">
          <div className="inline-toolbar">
            <CalendarDays size={18} color="var(--accent-color)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem" }}>Organization</h2>
          </div>
          <div className="helper-text">Tasks are grouped across {taskDates} dates and notes are linked across {noteDates} date views.</div>
          <div className="helper-text">Pinned tasks and notes automatically stay visible on today when you need quick carry-forward context.</div>
        </section>

        <section className="card panel-stack">
          <div className="inline-toolbar">
            <FolderOpen size={18} color="var(--accent-color)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem" }}>App Structure</h2>
          </div>
          <div className="note-links">
            <span className="note-link-chip">Tasks</span>
            <span className="note-link-chip">Notes</span>
            <span className="note-link-chip">Misc</span>
            <span className="note-link-chip">Settings</span>
          </div>
          <p className="helper-text">This page is ready to hold future preferences if you want us to add theme, export, or reset controls later.</p>
        </section>
      </div>
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
