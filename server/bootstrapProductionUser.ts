import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createOperationalStores } from './postgresOperationalStore';
import { hashServerPassword } from './serverAuth';
import { OperationalStoreConfigurationError } from './operationalStore';

const readArgument = (name: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? '' : '';
};

const readHiddenLine = (prompt: string): Promise<string> => {
  if (!stdin.isTTY || !stdin.setRawMode) {
    const readline = createInterface({ input: stdin, terminal: false });
    return readline.question('').finally(() => readline.close()).then((value) => value.trimEnd());
  }
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode!(true);
    stdin.resume();
    const onData = (data: Buffer) => {
      for (const byte of data) {
        if (byte === 3) {
          cleanup();
          reject(new Error('Bootstrap cancelled.'));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (byte === 8 || byte === 127) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        const character = Buffer.from([byte]).toString('utf8');
        if (/^[\x20-\x7e]$/.test(character)) {
          value += character;
          stdout.write('*');
        }
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode!(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
};

if (process.env.NODE_ENV !== 'production') {
  throw new OperationalStoreConfigurationError('Production user bootstrap requires NODE_ENV=production.');
}
if (process.argv.some((argument) => argument === '--password' || argument.startsWith('--password='))) {
  throw new OperationalStoreConfigurationError('Passwords must be supplied through the hidden prompt or stdin.');
}
const email = readArgument('--email').toLowerCase();
const name = readArgument('--name');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
  throw new OperationalStoreConfigurationError('Usage: user:bootstrap:production -- --email <email> --name <name>');
}
const password = await readHiddenLine('Password: ');
if (stdin.isTTY) {
  const confirmation = await readHiddenLine('Confirm password: ');
  if (password !== confirmation) throw new OperationalStoreConfigurationError('Passwords do not match.');
}
const passwordHash = await hashServerPassword(password);
const stores = await createOperationalStores({ environment: process.env });
try {
  await stores.users.create({
    id: randomUUID(),
    email,
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  console.info('[auth] Production user created.');
} finally {
  await stores.close();
}
