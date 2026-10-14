// Run the desktop app against the Vite dev server, with hot reload.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
const electron = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], {
  stdio: 'inherit',
  env: { ...process.env, PIANOSRS_DEV_URL: url },
  shell: process.platform === 'win32',
});
electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
