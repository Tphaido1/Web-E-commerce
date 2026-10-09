import { build, loadEnv } from 'vite';
import { validateDeploymentApiUrl } from './deployment-env.mjs';

const env = loadEnv('production', process.cwd(), 'VITE_');
try {
  validateDeploymentApiUrl(env.VITE_API_BASE_URL);
  await build({ mode: 'production' });
} catch (error) {
  console.error(`[deploy] ${error.message}`);
  process.exitCode = 1;
}
