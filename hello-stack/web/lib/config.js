/* Env is read once, at module load. A typo must never take the page down:
   anything unrecognised falls back to the first option. */

export const CELEBRATIONS = ['confetti', 'lasers', 'balloons', 'kisses'];
export const HATS = ['party', 'cap', 'crown', 'beanie'];

function pick(value, options) {
  return options.includes(value) ? value : options[0];
}

export const config = {
  celebration: pick(process.env.CELEBRATION, CELEBRATIONS),
  hat: pick(process.env.HAT, HATS),
  headline: process.env.HEADLINE || 'Your stack is now live.',
  publicUrl: process.env.PUBLIC_URL || '',   /* empty = the page infers its own origin */
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
};
