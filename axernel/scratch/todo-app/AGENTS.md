# todo-app

A single-page todo list (Vite + React + TypeScript). No backend, no router, no auth.
All code is in `src/App.tsx`; styles in `src/styles.css`.

## Run

    npm install
    npm run dev        # http://localhost:5173 (fixed port, fails if taken; bound to all hosts)

Checks: `npm run typecheck`, `npm run build`.

## State

Todos are stored in `localStorage` under the key `todo-app:todos` as a JSON array of
`{ id, text, done }`. Reset to the empty state with
`localStorage.removeItem('todo-app:todos')` and a reload (a fresh browser context is already empty).
Seed by setting that key before load, e.g. `[{"id":"1","text":"Buy milk","done":false}]`.

## Accessible names

- Heading: `Todos` (h1 inside `main`)
- Text input: label `New todo`; button `Add` (Enter in the input also submits)
- Each todo is an `li` with a checkbox named by its text (`Buy milk`) and a button `Delete Buy milk`
- Counter text: `N items left` (`1 item left` when singular), role `status`
- Empty state text: `Nothing to do yet. Add your first todo above.`
- Footer filters: group `Filter todos` with toggle buttons `All`, `Active`, `Completed` (the chosen one has `aria-pressed="true"`); a filter with no matches shows `No active todos.` or `No completed todos.`
- Button `Clear completed`, disabled while nothing is completed

## Flows, most demo-worthy first

1. Add a todo: type in `New todo`, click `Add` or press Enter; it appears at the end of the list.
2. Complete a todo: tick its checkbox; the text is struck through and the counter drops.
3. Delete a todo: click `Delete <text>`; deleting the last one brings back the empty state.
4. Filter by status: click `Active` or `Completed` in the footer; the list narrows and the counter keeps reporting what is left.
5. Clear completed: click `Clear completed`; every finished todo goes at once and the button disables.
6. Persistence: reload the page; todos and their completed state remain. The chosen filter is not persisted.
