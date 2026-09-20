# How to make a walkthrough video in this sandbox

Everything is installed in `/opt/walkthrough`. You write two files and run one command.

## The two files

`/opt/walkthrough/demos/walk.scenes.json`: the narration, one entry per scene.

```json
[
  { "scene": "intro", "text": "This is a small todo app. Let me add a task." },
  { "scene": "add", "text": "I type a title and press Enter. The task appears in the list." }
]
```

`/opt/walkthrough/demos/walk.demo.ts`: a Playwright test that performs the demo. Copy the shape of `demos/sample.demo.ts`.

```ts
import { test } from '@argo-video/cli';
import { cursorHighlight, zoomTo, resetCamera, spotlight, showCaption } from '@argo-video/cli';

test('walk', async ({ page, narration }) => {
  test.setTimeout(600000);
  await page.goto('/');
  // setup that should NOT be in the video goes here: seed data, log in, dismiss banners
  await cursorHighlight(page, { clickRipple: true });
  await narration.startRecording(page);

  narration.mark('intro');
  await page.waitForTimeout(narration.durationFor('intro'));

  narration.mark('add');
  const t = Date.now();
  await page.getByLabel('New todo').fill('Buy milk');
  await page.keyboard.press('Enter');
  await page.getByText('Buy milk').waitFor();
  await page.waitForTimeout(Math.max(0, narration.durationFor('add') - (Date.now() - t)));
});
```

## The command

```bash
export WTP_BASE_URL=http://localhost:<port>   # the app you started
wtp-render walk <artifact output directory>
```

It generates the voiceover, records, exports, burns captions, verifies, and copies `walkthrough.mp4`, `walkthrough.srt` and `walkthrough-clean.mp4` into the output directory. On success it prints `WTP_OK` followed by chapter lines (`START` divided by the `TIMEBASE` denominator gives each scene's start in seconds; use them for `startSec`). On failure the last line is `WTP_ERROR: <reason>` with log lines above it. Full log: `/opt/walkthrough/.argo/walk.render.log`.

## Rules that prevent broken takes

- Scene names in `scenes.json` and `narration.mark('...')` must match exactly, in the same order, each marked once.
- The test title must equal the demo name (`walk`).
- Every scene ends by waiting out the rest of its narration: `durationFor(scene)` minus the time the actions took. Otherwise the voice runs over the next scene.
- Wait on durable UI state (`getByText(...).waitFor()`), never on a toast or a fixed sleep.
- Prefer `getByRole`, `getByLabel`, `getByText`. Read the app's source for the real accessible names instead of guessing. If a click is intercepted by an overlay, use `locator.evaluate(el => el.click())`.
- Do setup (seeding, login, clearing localStorage) before `startRecording`.
- Start the app in the background with its output in a log file, for example `nohup npm run dev > /tmp/app.log 2>&1 &`, and poll the port with `curl` until it answers. Bind to `0.0.0.0` or `localhost`; either works.
- Never run two `wtp-render` at once.
- Before recording, you can check selectors quickly with a plain Playwright script in `/opt/walkthrough` (`npx playwright test` is not needed; `node -e` with `playwright` works) or by reading the component source.

## Writing scenes that land

- 3 to 6 scenes. One idea per scene. The whole video fits the requested length; narration speed is roughly 2.5 words per second, so 60 seconds is about 140 words in total.
- Open with one sentence on what the app or feature is. Close with one sentence on the outcome. No greetings, no "in this video".
- Narration is read aloud: short sentences, no parentheses, no code symbols, spell out abbreviations that read badly.
- Show the feature working with realistic data, not "test 123".
- Use `zoomTo(page, selector, { narration })` then `resetCamera(page)` for one small detail at most. Use `showCaption(page, scene, text, ms)` only for a measured value. Skip overlays otherwise.
