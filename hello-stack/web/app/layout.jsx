import './globals.css';
import ThemeToggle from '../components/ThemeToggle';

/* runs before first paint, or the page flashes dark on its way to light */
const THEME_BOOT = `try{var t=localStorage.getItem('theme');
document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');}
catch(e){document.documentElement.dataset.theme='dark';}`;

export const metadata = {
  title: 'Your stack is now live — Stackdome',
  description: 'Three containers, one button, and the traffic between them made visible.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><ThemeToggle />{children}</body>
    </html>
  );
}
