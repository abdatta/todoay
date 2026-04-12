"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Pin, PinOff, CopyPlus, Trash2, NotebookPen, SplitSquareVertical } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import DateNavigator from "@/components/DateNavigator";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";

function NotesScreen() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const { ready, state, addNote, updateNoteDoc, removeNoteFromDate, carryNoteToDate, getVisibleNoteIds, getDatesForNote } = useTodoay();

  const noteIds = useMemo(() => getVisibleNoteIds(selectedDate, today), [getVisibleNoteIds, selectedDate, today]);
  const notes = noteIds.map((id) => state.noteDocs[id]).filter(Boolean);

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  return (
    <div className="app-shell">
      <PageHeader
        title="Notes"
        icon={<NotebookPen size={30} color="var(--accent-color)" />}
      />

      <DateNavigator date={selectedDate} onChange={setSelectedDate} />

      <section className="card panel-stack">
        {notes.length === 0 ? (
          <div className="empty-state">No notes for this date yet. Add one and use separate notes instead of a single endless page.</div>
        ) : (
          notes.map((note) => {
            const dates = getDatesForNote(note.id);
            const isLinkedElsewhere = dates.length > 1;
            return (
              <article key={note.id} className="note-card">
                <div className="inline-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <input
                    className="note-title-input"
                    value={note.title}
                    placeholder="Note title"
                    onChange={(event) => updateNoteDoc(note.id, { title: event.target.value })}
                  />
                  <div className="note-actions">
                    <button className="btn-icon" title={note.pinned ? "Unpin note" : "Pin note"} onClick={() => updateNoteDoc(note.id, { pinned: !note.pinned })}>
                      {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                    {selectedDate !== today ? (
                      <button className="btn-icon" title="Carry note to today" onClick={() => carryNoteToDate(selectedDate, note.id, today)}>
                        <CopyPlus size={16} />
                      </button>
                    ) : null}
                    <button className="btn-icon" title="Remove note from this day" onClick={() => removeNoteFromDate(selectedDate, note.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <textarea
                  className="note-textarea"
                  value={note.content}
                  placeholder={"Write freely here. Use lines like --- as visual dividers, or create another note card with New note."}
                  onChange={(event) => updateNoteDoc(note.id, { content: event.target.value })}
                />

                <div className="inline-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="note-links">
                    {dates.map((date) => (
                      <span key={date} className="note-link-chip">{date}</span>
                    ))}
                    {note.pinned ? <span className="note-link-chip">Pinned to today</span> : null}
                    {isLinkedElsewhere ? <span className="note-link-chip">Shared across dates</span> : null}
                  </div>
                  <div className="inline-toolbar">
                    <button className="secondary-button" onClick={() => updateNoteDoc(note.id, { content: `${note.content}${note.content ? "\n" : ""}---\n` })}>
                      <SplitSquareVertical size={16} /> Insert divider
                    </button>
                    <button className="secondary-button" onClick={() => carryNoteToDate(selectedDate, note.id, today)}>
                      <CopyPlus size={16} /> Carry to today
                    </button>
                  </div>
                </div>

                <div className="note-meta">Updated {new Date(note.updatedAt).toLocaleString()}</div>
              </article>
            );
          })
        )}
        <button className="secondary-button" onClick={() => addNote(selectedDate)}>
          <Plus size={16} /> Add another note
        </button>
      </section>
    </div>
  );
}

export default function NotesPage() {
  return (
    <ClientReady>
      <NotesScreen />
    </ClientReady>
  );
}
