import { build, loadEnv } from 'vite';
import { validateDeploymentEnv } from './deployment-env.mjs';

try {
  validateDeploymentEnv({ ...loadEnv('production', process.cwd(), ''), ...process.env });
  if (process.argv.includes('--check-only')) console.log('Deployment endpoints passed HTTPS and public-host validation.');
  else await build({ mode: 'production' });
} catch (error) {
  console.error(`Admin deployment blocked: ${error.message}`);
  process.exitCode = 1;
}
