"use client";

import { useState } from "react";
import { Shapes, Plus, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";

function MiscScreen() {
  const { ready, state, updateUndatedEntry, deleteUndatedEntry, addUndatedChecklistItem, updateUndatedChecklistItem, deleteUndatedChecklistItem } = useTodoay();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  return (
    <div className="app-shell">
      <PageHeader
        title="Misc"
        icon={<Shapes size={30} color="var(--accent-color)" />}
      />

      <section className="card panel-stack">
        {state.undatedEntries.length === 0 ? (
          <div className="empty-state">No misc items yet. Start with a note or a reusable list.</div>
        ) : (
          state.undatedEntries.map((entry) => {
            const expanded = expandedIds[entry.id] ?? true;
            return (
              <article key={entry.id} className="undated-card">
                <div className="inline-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="inline-toolbar">
                    <span className="pill">{entry.type === "list" ? "List" : "Note"}</span>
                    <input
                      className="undated-title-input"
                      value={entry.title}
                      placeholder={entry.type === "list" ? "List title" : "Note title"}
                      onChange={(event) => updateUndatedEntry(entry.id, { title: event.target.value })}
                    />
                  </div>
                  <div className="inline-toolbar">
                    <button className="btn-icon" onClick={() => setExpandedIds((current) => ({ ...current, [entry.id]: !expanded }))} title={expanded ? "Collapse" : "Expand"}>
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button className="btn-icon" onClick={() => deleteUndatedEntry(entry.id)} title="Delete entry">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {expanded ? entry.type === "note" ? (
                  <textarea
                    className="undated-textarea"
                    value={entry.text}
                    placeholder="Write anything here."
                    onChange={(event) => updateUndatedEntry(entry.id, { text: event.target.value })}
                  />
                ) : (
                  <div className="undated-list-items">
                    {entry.items.map((item) => (
                      <div key={item.id} className="undated-list-row">
                        <input
                          className="todo-checkbox"
                          type="checkbox"
                          checked={item.completed}
                          onChange={(event) => updateUndatedChecklistItem(entry.id, item.id, { completed: event.target.checked })}
                        />
                        <input
                          className={`todo-input ${item.completed ? "completed" : ""}`}
                          value={item.text}
                          placeholder="List item"
                          onChange={(event) => updateUndatedChecklistItem(entry.id, item.id, { text: event.target.value })}
                        />
                        <button className="btn-icon" onClick={() => deleteUndatedChecklistItem(entry.id, item.id)} title="Delete item">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button className="secondary-button" onClick={() => addUndatedChecklistItem(entry.id)}>
                      <Plus size={16} /> Add item
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

export default function MiscPage() {
  return (
    <ClientReady>
      <MiscScreen />
    </ClientReady>
  );
}
