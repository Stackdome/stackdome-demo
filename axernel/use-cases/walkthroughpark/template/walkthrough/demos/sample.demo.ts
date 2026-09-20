import { test } from '@argo-video/cli';
import { cursorHighlight } from '@argo-video/cli';

test('sample', async ({ page, narration }) => {
  test.setTimeout(300000);
  await page.goto('/');
  await cursorHighlight(page, { clickRipple: true });

  // everything before startRecording is setup and stays out of the video
  await narration.startRecording(page);

  narration.mark('welcome');
  await page.waitForTimeout(narration.durationFor('welcome'));

  narration.mark('action');
  const started = Date.now();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Started!' }).waitFor();
  await page.waitForTimeout(Math.max(0, narration.durationFor('action') - (Date.now() - started)));

  narration.mark('done');
  await page.waitForTimeout(narration.durationFor('done'));
});
