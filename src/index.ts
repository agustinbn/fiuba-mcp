#!/usr/bin/env node
import { loginCli } from './cli/login.ts';
import { startServer } from './server.ts';

if (process.argv[2] === 'login') {
  loginCli().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
} else {
  await startServer();
}
