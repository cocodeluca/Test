import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('server', 'migrations');
const destination = path.resolve('dist-server', 'migrations');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
