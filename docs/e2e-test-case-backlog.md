# E2E Test Case Backlog

## Tasks / Date Flows

- [x] Navigate previous and next day and verify task lists change per date.
- [x] Open the date picker, choose a specific calendar day, and verify the selected day is shown.
- [x] Create multiple tasks and verify Enter creates the next focused task.
- [x] Backspace on an empty task deletes it and focuses the previous task.
- [x] Verify a task checkbox is disabled while task text is empty.
- [x] Delete a task from the task action menu.
- [x] Copy a task to another date using the task menu and date picker.
- [x] Move a task to another date and verify it disappears from the source date.
- [x] With linked copies enabled, copy a task, complete one copy, and verify the other copy updates.
- [x] With linked copies disabled, copy a task, complete one copy, and verify the other copy stays independent.
- [x] Add a task duration, clear it, and verify it persists as empty after reload.
- [ ] Enter non-numeric duration text and verify only digits are accepted.
- [x] Open a task menu, click outside, and verify the menu closes.
- [ ] Open a task menu, press Escape, and verify the menu closes.
- [x] Long-press or drag reorder tasks and verify the order persists after reload.
- [x] Verify the Tasks date picker shows progress indicators for dates with open and completed tasks.
- [x] Verify partial task completion shows a partial progress indicator in the Tasks date picker.
- [x] Verify fully completed task dates show a completed progress indicator in the Tasks date picker.
- [x] Verify task progress indicators remain attached to the correct dates after navigating between months.
- [x] Open the Tasks date picker from a non-current date and verify it opens to that date's month.
- [x] Use the Tasks date picker Today action and verify it returns to today.
- [x] Use the Tasks date picker Backlog action and verify it switches to Backlog.
- [x] Use Tasks date picker previous and next month buttons and verify the visible month changes without changing the selected date.
- [x] Use mouse wheel or trackpad scrolling in the Tasks date picker and verify it snaps continuously to the previous and next month.
- [x] Drag the Tasks date picker month grid up and down and verify it snaps continuously to the previous and next month.
- [x] Drag the Tasks date picker month grid and verify it does not accidentally select a day during the gesture.
- [x] Click an outside-month day in the Tasks date picker and verify it does not change the selected date.
- [x] Click outside the Tasks date picker and verify it closes without changing the selected date.
- [ ] Open a task Copy to date picker and cancel it without creating a copy.
- [ ] Open a task Move to date picker and cancel it without moving the task.

## Backlog

- [x] Verify Backlog excludes future tasks.
- [x] Verify Backlog excludes past tasks already copied or scheduled to today or a future date.
- [x] Verify Backlog groups the same linked task across multiple past dates.
- [x] Click a Backlog date link and verify it navigates to the original task date.
- [x] Delete a Backlog reference and verify all linked dated copies are removed.
- [x] Cancel Backlog delete confirmation and verify the task remains.
- [x] Open a Backlog task thread indicator and navigate to its thread.
- [x] Use Backlog Copy to and verify the copied task appears on the selected date.
- [x] Verify Backlog Move to is disabled.

## Threads

- [x] Create a thread, blur an empty draft title, and verify no thread is created.
- [x] Create a thread, press Escape in the draft title, and verify the draft is canceled.
- [x] Rename a thread from the thread detail title input and verify the list updates.
- [x] Pin and unpin a thread and verify it moves between pinned and active lanes.
- [x] Archive a thread from the list and verify it moves into the collapsed Archived section.
- [x] Expand the Archived section and restore a thread.
- [x] Delete a thread with confirmation and verify it returns to the thread list.
- [x] Cancel thread deletion confirmation and verify the thread remains.
- [x] Add multiple thread tasks and verify Enter creates and focuses the next task.
- [x] Backspace an empty thread task and verify previous task focus.
- [x] Complete a thread task and verify it moves to the completed section.
- [x] Delete a thread task and verify it disappears.
- [x] Add duration to a thread task and verify it persists.
- [x] Add a thread task to a day and verify the scheduled task appears on Tasks.
- [x] Open a scheduled-date indicator from a thread task and navigate to the scheduled date.
- [x] Verify archived threads are read-only: no task edits, no add, and no task menu actions.

## Task / Thread Integration

- [x] Add a dated task to an existing thread from the task menu.
- [x] Verify a dated task shows a thread indicator after being added to a thread.
- [x] Open a dated task thread indicator and navigate to the thread.
- [x] Complete the dated task and verify the linked thread task is completed.
- [x] Complete the thread task and verify the linked dated task is completed.
- [x] Delete a thread task and verify the linked dated task is removed or unlinked according to expected behavior.
- [x] Delete a thread and verify related dated thread tasks are removed from Tasks.

## Notes

- [x] Navigate Notes previous and next day and verify notes are date-scoped.
- [x] Delete a note from a date and verify it disappears.
- [x] Create multiple notes on one day and verify both persist after reload.
- [x] Add long note content beyond the viewport and verify typing does not jump scroll unexpectedly.
- [x] Verify `- ` bullet continuation works in an existing note.
- [x] Click Add another note and verify the new note is focused.
- [x] Verify `* ` bullet continuation works in an existing note.
- [x] Press Enter in a non-bullet note and verify normal newline behavior.
- [x] Verify the Notes date picker shows note-day progress indicators.
- [x] Delete one note when multiple notes exist and verify only that note is removed.
- [x] Add a note, navigate away, return, and verify content persists.

## Settings / Import / Export

- [x] Change theme to Dark, Light, and System and verify the theme changes and persists.
- [x] Open the theme dropdown, click outside, and verify it closes.
- [ ] Open the theme dropdown, press Escape, and verify it closes.
- [x] Export JSON and verify the downloaded file contains tasks, notes, threads, and settings.
- [x] Import invalid JSON and verify a graceful error message.
- [x] Import structurally invalid Todoay JSON and verify a graceful error message.
- [x] Import a conflicting task and verify the conflict modal appears.
- [x] Resolve an import conflict with Keep existing.
- [x] Resolve an import conflict with Use imported.
- [x] Resolve an import conflict with Keep both.
- [x] Cancel the import conflict modal and verify no import occurs.
- [x] Verify the Cloud History button is disabled when signed out or local-only.
- [x] Verify the Sign in button appears when Supabase is configured but unauthenticated, using a mocked Supabase client.

## Navigation / App Shell

- [x] Use the bottom navigation to route to Tasks, Threads, Notes, and Settings.
- [ ] Verify `/tasks` redirects to `/`.
- [ ] Verify `/today` renders the Tasks experience.
- [x] Visit an unknown thread id and verify Thread not found is shown.
- [x] Reload each main route and verify app state is restored from localStorage.
- [x] Run a mobile viewport smoke test for all main screens and verify critical controls are visible.
