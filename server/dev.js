import { spawn } from 'node:child_process';

const options = { stdio: 'inherit', env: process.env };
const api = spawn(process.execPath, ['server/index.js'], options);
const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:client'], options);

function stop(signal = 'SIGTERM') {
    if (!api.killed) api.kill(signal);
    if (!vite.killed) vite.kill(signal);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(signal); process.exit(0); });
api.on('exit', code => { if (code) { stop(); process.exit(code); } });
vite.on('exit', code => { if (code) { stop(); process.exit(code); } });
