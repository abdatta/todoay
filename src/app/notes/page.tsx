"use client";

import { useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { format } from "date-fns";
import { Plus, NotebookPen, X } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import DateNavigator from "@/components/DateNavigator";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function getBulletPrefix(text: string, selectionStart: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const currentLine = text.slice(lineStart, selectionStart);
  const trimmedLine = currentLine.trimStart();

  if (trimmedLine.startsWith("- ")) {
    return "- ";
  }

  if (trimmedLine.startsWith("* ")) {
    return "* ";
  }

  return null;
}

function NotesScreen() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const { ready, state, addNote, updateNoteDoc, removeNoteFromDate, getVisibleNoteIds } = useTodoay();

  const noteIds = useMemo(() => getVisibleNoteIds(selectedDate, today), [getVisibleNoteIds, selectedDate, today]);
  const notes = noteIds.map((id) => state.noteDocs[id]).filter(Boolean);
  const hasSavedNotes = notes.length > 0;
  const dateProgress = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(state.noteIdsByDate).flatMap(([date, ids]) => (
          ids.length > 0
            ? [[date, { completed: 1, total: 1, useTrackColorValue: true }] as const]
            : []
        )),
      ),
    [state.noteIdsByDate],
  );

  const handleDraftChange = (content: string) => {
    if (!content) {
      return;
    }

    const noteId = addNote(selectedDate);
    updateNoteDoc(noteId, { content });
  };

  const handleDeleteNote = (noteId: string) => {
    removeNoteFromDate(selectedDate, noteId);
  };

  const handleBulletEnter = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    applyContent: (nextContent: string) => void,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd, value } = textarea;
    const bulletPrefix = getBulletPrefix(value, selectionStart);

    if (!bulletPrefix) {
      return;
    }

    event.preventDefault();

    const nextContent = `${value.slice(0, selectionStart)}\n${bulletPrefix}${value.slice(selectionEnd)}`;
    const nextCaret = selectionStart + bulletPrefix.length + 1;

    applyContent(nextContent);

    requestAnimationFrame(() => {
      textarea.setSelectionRange(nextCaret, nextCaret);
      autoResizeTextarea(textarea);
    });
  };

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  return (
    <div className="app-shell">
      <PageHeader
        title="Notes"
        icon={<NotebookPen size={30} color="var(--accent-color)" />}
      />

      <DateNavigator date={selectedDate} onChange={setSelectedDate} dateProgress={dateProgress} />

      <section className="card panel-stack">
        {hasSavedNotes ? (
          notes.map((note) => (
            <article key={note.id} className="note-card">
                <button
                  className="note-delete-button"
                  type="button"
                  aria-label="Delete note"
                  onClick={() => handleDeleteNote(note.id)}
                >
                  <X size={16} />
                </button>
                <textarea
                  className="note-textarea"
                  value={note.content}
                  placeholder="Write freely here."
                  onChange={(event) => updateNoteDoc(note.id, { content: event.target.value })}
                  onKeyDown={(event) =>
                    handleBulletEnter(event, (nextContent) => updateNoteDoc(note.id, { content: nextContent }))
                  }
                  onInput={(event: FormEvent<HTMLTextAreaElement>) => autoResizeTextarea(event.currentTarget)}
                  ref={autoResizeTextarea}
                />
            </article>
          ))
        ) : (
          <article className="note-card">
            <textarea
              className="note-textarea"
              defaultValue=""
              placeholder="Write freely here."
              onKeyDown={(event) =>
                handleBulletEnter(event, (nextContent) => handleDraftChange(nextContent))
              }
              onInput={(event: FormEvent<HTMLTextAreaElement>) => {
                autoResizeTextarea(event.currentTarget);
                handleDraftChange(event.currentTarget.value);
              }}
              ref={autoResizeTextarea}
            />
          </article>
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
