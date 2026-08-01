'use client';

import { useEffect, useState } from 'react';

/* the head script has already resolved the theme before paint; this only
   reads back what it decided, so the button never disagrees with the page */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'dark'); }, []);

  function flip() {
    /* the element is the truth, not the state: two clicks inside one frame
       would both read the same stale state and set the same theme twice */
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    /* private mode and blocked storage both throw here — the flip still stands,
       it just will not outlive the tab */
    try { localStorage.setItem('theme', next); } catch {}
  }

  /* nothing on the server: the theme is not known until the head script runs */
  if (theme === null) return <button className="theme" aria-hidden="true" tabIndex={-1} />;

  const dark = theme !== 'light';
  return (
    <button
      className="theme"
      onClick={flip}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
