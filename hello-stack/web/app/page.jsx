import Stage from '../components/Stage';
import { config } from '../lib/config';

/* env is read at module load, so a redeploy is what applies a change */
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Stage
      config={{
        celebration: config.celebration,
        hat: config.hat,
        headline: config.headline,
        publicUrl: config.publicUrl,
      }}
    />
  );
}
