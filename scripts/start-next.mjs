import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const requestedPort = process.env.PORT ? Number(process.env.PORT) : 3000;
const maxPort = process.env.PORT ? requestedPort : 3100;

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

let port = requestedPort;
while (port <= maxPort && !(await isPortAvailable(port))) port += 1;

if (port > maxPort) {
  console.error(
    process.env.PORT
      ? `Port ${requestedPort} is already in use.`
      : 'No available port found between 3000 and 3100.',
  );
  process.exit(1);
}

if (port !== requestedPort) {
  console.log(`Port ${requestedPort} is in use; starting CityFix on ${port}.`);
}

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const next = spawn(process.execPath, [nextBin, 'start', '--port', String(port)], {
  stdio: 'inherit',
  env: process.env,
});

next.on('error', (error) => {
  console.error('Could not start Next.js:', error.message);
  process.exitCode = 1;
});

next.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
