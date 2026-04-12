# Todoay Agent Context

## What This App Is

Todoay is a lightweight daily-use app for tasks, notes and misc lists built with Next.js.

It is intentionally:

- frontend-only
- local-first
- persisted entirely in `localStorage`
- statically exportable for GitHub-friendly hosting
- visually inspired by the dark mode of the separate `misti-viewer` app

The current product idea is:

1. A `Today` page for dated checklist items.
2. A `Notes` page for dated note documents.
3. A `Library` page for undated mixed items that can be either notes or lists.

## Core Product Requirements Already Reflected

### Today page

- Main screen focuses on a selected date, defaulting to today.
- Header says `Today`.
- Date can be changed to past or future.
- Future or untouched dates naturally start empty.
- Past unfinished todos can be copied to today easily.
- Todo items can be pinned.
- Pinned todo items should appear on today regardless of original date.

### Notes page

- Notes are also date-based.
- A date can have multiple separate note documents instead of one monolithic note.
- Each note is an independent card/document.
- Users can insert dividers into a note by appending `---`.
- A note can be carried forward to today without duplicating its content into a separate object.
- Carried-forward notes should be visible on both the old date and today.
- Notes can be pinned.
- Pinned notes should appear on today regardless of their original date linkage.

### Library page

- Undated workspace.
- Contains a mixed list of expandable entries.
- Each entry is either:
  - a note
  - a checklist

## Current Tech Stack

- Next.js app router
- React 19
- TypeScript
- `date-fns`
- `lucide-react`
- static export enabled via `output: "export"`

Important files:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/today/page.tsx`
- `src/app/notes/page.tsx`
- `src/app/library/page.tsx`
- `src/components/Navigation.tsx`
- `src/components/PageHeader.tsx`
- `src/components/DateNavigator.tsx`
- `src/components/ClientReady.tsx`
- `src/lib/types.ts`
- `src/lib/store.tsx`
- `next.config.ts`

## Visual Direction

The UI was intentionally built to feel very close to the dark mode of `misti-viewer`.

That means:

- warm near-black background
- soft radial background glow
- frosted charcoal cards
- peach/orange accent color and accent gradient
- rounded floating bottom navigation
- `Inter` for body text
- `Outfit` for headings
- soft borders, glassy shadows, rounded pills, similar spacing rhythm

This is not meant to look generic. If extending the UI, preserve the same visual language.

## Routing

Current routes:

- `/` redirects to `/today`
- `/today`
- `/notes`
- `/library`

All pages are static-renderable.

## Data Model

Defined in `src/lib/types.ts`.

### `TodoItem`

- `id`
- `text`
- `completed`
- `pinned`
- `createdAt`
- `sourceDate`
- optional `copiedFromDate`

### `NoteDocument`

- `id`
- `title`
- `content`
- `pinned`
- `createdAt`
- `updatedAt`

Notes are linked to dates by ID instead of being duplicated per date.

### `UndatedEntry`

- `id`
- `type`: `"list"` or `"note"`
- `title`
- `text`
- `items`

### `TodoayState`

- `todosByDate: Record<string, TodoItem[]>`
- `noteIdsByDate: Record<string, string[]>`
- `noteDocs: Record<string, NoteDocument>`
- `undatedEntries: UndatedEntry[]`

## Storage Model

Implemented in `src/lib/store.tsx`.

The app stores a single serialized object in:

- `localStorage["todoay-state-v1"]`

There is no backend and no API layer.

The provider:

- loads state from localStorage on mount
- exposes actions through React context
- persists the full state back to localStorage after changes

This means:

- data is per-browser
- data is not synced
- data is not shared across devices

That is acceptable for now and intentional.

## Important Current Behaviors

### Today visibility logic

`getVisibleTodos(date, today)`:

- returns direct todos for the selected date
- if the selected date is today, also includes pinned todos from other dates

### Notes visibility logic

`getVisibleNoteIds(date, today)`:

- returns note IDs linked directly to the selected date
- if selected date is today, also includes pinned notes not already linked to today

### Carry-forward of todos

`copyTodoToDate(fromDate, todoId, toDate)`:

- copies a todo to another date
- resets completion to `false`
- preserves original text
- records `copiedFromDate`
- avoids creating a duplicate if a matching copied task already exists on target date

### Carry-forward of notes

`carryNoteToDate(fromDate, noteId, toDate)`:

- links the same note document ID to another date
- does not duplicate the note document
- allows the same note to appear on multiple dates

### Removing a note from a day

`removeNoteFromDate(date, noteId)`:

- removes only the date linkage
- does not delete the underlying note document from `noteDocs`

Potential consequence:

- orphaned notes can exist in `noteDocs` if all date links are removed
- this is not handled yet

## Current Page Details

## `/today`

Implemented in `src/app/today/page.tsx`.

Current features:

- date selector with previous/next day controls
- summary cards
- task creation
- task text editing
- completion toggle
- pin/unpin
- delete
- copy-to-today when viewing a non-today date
- carry-forward section showing unfinished items from older dates

Current behavior note:

- when a pinned item from another day appears on today, edits still update the original dated item via `sourceDate`

## `/notes`

Implemented in `src/app/notes/page.tsx`.

Current features:

- date selector
- create multiple notes per date
- note title editing
- note content editing
- pin/unpin
- carry note to today
- remove note from current date
- insert `---` divider into a note
- show chips for linked dates and pinned/shared state

Important product interpretation:

- “split today’s note into multiple notes” is currently modeled as multiple note cards/documents for a day
- divider insertion exists inside each note as requested

## `/library`

Implemented in `src/app/library/page.tsx`.

Current features:

- create undated note entries
- create undated checklist entries
- collapse/expand entries
- edit titles
- edit note text
- add checklist items
- toggle checklist completion
- delete checklist items
- delete entries

## Static Hosting Status

The project is configured for static export.

`next.config.ts` currently contains:

- `output: "export"`

Production build has already succeeded locally with:

- `npm run build`

## Important Constraints For Future Work

Keep these true unless explicitly changing the product direction:

- no backend
- no server database
- no API routes required
- localStorage remains the source of truth for now
- app should remain compatible with static hosting
- preserve the existing dark visual language

## Known Gaps / Next Good Improvements

These are sensible next tasks for a future agent:

1. Add a real delete path for notes.
   Right now removing a note from a date only removes the relationship, not the underlying note doc.

2. Handle orphaned note documents.
   A cleanup strategy may be needed when no date references remain.

3. Improve date state in URL.
   Dates are local component state only right now. They are not reflected in query params, so navigation state is not shareable/bookmarkable.

4. Improve pinned-item UX.
   Consider clearer labeling when a pinned todo or note shown on today actually belongs to another date.

5. Add import/export for local backups.
   This would fit the local-first model well and help with portability.

6. Add better note structure UX.
   The divider is currently plain text insertion of `---`. A richer editor experience could make note sections feel more intentional.

7. Add empty-state polish and microinteractions.
   The base app feels close visually, but there is room to make transitions and states feel even more refined.

8. Add GitHub Pages deployment guidance or workflow.
   Static export is already enabled, but publishing automation is not set up.

9. Add sample seed data or first-run onboarding.
   Right now new users start from a blank slate.

10. Audit mobile ergonomics.
    The app is responsive, but a device-by-device polish pass would still be valuable.

## Build / Run Commands

From the project root:

- `npm install`
- `npm run dev`
- `npm run build`

## Current Status Summary

The app is already working as a separate standalone project with:

- separate folder outside the original repo
- localStorage-only persistence
- static export support
- dark-mode-inspired styling
- Today, Notes, and Library pages
- carry-forward and pinning logic

If a new agent picks this up, it should treat the current implementation as the baseline and refine it rather than replacing the architecture outright.
