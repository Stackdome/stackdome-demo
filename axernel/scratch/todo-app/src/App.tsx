import { useEffect, useState, type FormEvent } from 'react';

export const STORAGE_KEY = 'todo-app:todos';

type Todo = { id: string; text: string; done: boolean };

const FILTERS = ['All', 'Active', 'Completed'] as const;
type Filter = (typeof FILTERS)[number];

function loadTodos(): Todo[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as Todo[]) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  function addTodo(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Not crypto.randomUUID: it is undefined outside secure contexts (sandbox IP access).
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTodos((prev) => [...prev, { id, text, done: false }]);
    setDraft('');
  }

  const remaining = todos.filter((todo) => !todo.done).length;
  const completed = todos.length - remaining;
  const visible = todos.filter(
    (todo) => filter === 'All' || (filter === 'Completed' ? todo.done : !todo.done),
  );

  return (
    <main>
      <h1>Todos</h1>

      <form onSubmit={addTodo}>
        <label htmlFor="new-todo">New todo</label>
        <div className="add-row">
          <input
            id="new-todo"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs doing?"
            autoComplete="off"
            autoFocus
          />
          <button type="submit">Add</button>
        </div>
      </form>

      {todos.length === 0 ? (
        <p className="empty">Nothing to do yet. Add your first todo above.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No {filter.toLowerCase()} todos.</p>
      ) : (
        <ul>
          {visible.map((todo) => (
            <li key={todo.id} className={todo.done ? 'done' : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() =>
                    setTodos((prev) =>
                      prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)),
                    )
                  }
                />
                <span>{todo.text}</span>
              </label>
              <button
                type="button"
                className="delete"
                aria-label={`Delete ${todo.text}`}
                onClick={() => setTodos((prev) => prev.filter((t) => t.id !== todo.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer>
        <p className="count" role="status">
          {remaining} {remaining === 1 ? 'item' : 'items'} left
        </p>

        <div className="filters" role="group" aria-label="Filter todos">
          {FILTERS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={filter === name}
              onClick={() => setFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="clear"
          disabled={completed === 0}
          onClick={() => setTodos((prev) => prev.filter((todo) => !todo.done))}
        >
          Clear completed
        </button>
      </footer>
    </main>
  );
}
