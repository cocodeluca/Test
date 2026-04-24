import WebSocket from 'ws';

const CDP_HTTP = 'http://localhost:9224';
const APP_URL = 'http://localhost:8081';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targetList = await fetch(`${CDP_HTTP}/json/list`).then((res) => res.json());
  const pageTarget = targetList.find((target) => target.type === 'page');

  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('No page target found.');
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }

      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message || 'CDP command failed'));
        return;
      }

      entry.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const values = (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? '');
      console.log('[console]', message.params.type, ...values);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', JSON.stringify(message.params.exceptionDetails, null, 2));
      return;
    }

    if (message.method === 'Log.entryAdded') {
      console.log('[log]', JSON.stringify(message.params.entry, null, 2));
    }
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  await send('Page.navigate', { url: APP_URL });
  await sleep(5000);

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const demoButton = Array.from(document.querySelectorAll('button')).find((button) =>
          (button.textContent || '').trim() === 'Try demo account'
        );
        if (demoButton) {
          demoButton.click();
          return 'clicked-demo';
        }
        return 'no-demo-button';
      })()
    `,
    returnByValue: true,
  });

  await sleep(5000);

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const propertiesButton = Array.from(document.querySelectorAll('button')).find((button) =>
          (button.textContent || '').trim() === 'Propiedades'
        );
        if (propertiesButton) {
          propertiesButton.click();
          return 'clicked-properties';
        }
        return 'no-properties-button';
      })()
    `,
    returnByValue: true,
  });

  await sleep(3000);

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const addButton = Array.from(document.querySelectorAll('button')).find((button) =>
          (button.textContent || '').trim() === 'Anadir propiedad manualmente'
        );
        if (addButton) {
          addButton.click();
          return 'clicked-add-property';
        }
        return 'no-add-button';
      })()
    `,
    returnByValue: true,
  });

  await sleep(3000);

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const setValue = (placeholder, value) => {
          const input = Array.from(document.querySelectorAll('input')).find((node) => node.placeholder === placeholder);
          if (!input) {
            return false;
          }

          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };

        const updates = [
          ['Apartamento en Valencia centro', 'Demo Gallery Property'],
          ['Calle y número', 'Calle Falsa 123'],
          ['Málaga', 'Valencia'],
          ['España', 'España'],
          ['125000', '125000'],
          ['950', '950'],
          ['140', '140'],
          ['22', '22'],
          ['30', '30'],
        ];

        return updates.map(([placeholder, value]) => ({ placeholder, ok: setValue(placeholder, value) }));
      })()
    `,
    returnByValue: true,
  });

  await sleep(1000);

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const createButton = Array.from(document.querySelectorAll('button')).find((button) =>
          (button.textContent || '').trim() === 'Crear propiedad'
        );
        if (createButton) {
          createButton.click();
          return 'clicked-create';
        }
        return 'no-create-button';
      })()
    `,
    returnByValue: true,
  });

  await sleep(4000);

  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const editButton = Array.from(document.querySelectorAll('button')).find((button) =>
          (button.textContent || '').trim() === 'Editar'
        );
        if (editButton) {
          editButton.click();
          return 'clicked-edit';
        }
        return 'no-edit-button';
      })()
    `,
    returnByValue: true,
  });

  await sleep(3000);

  const result = await send('Runtime.evaluate', {
    expression: `
      (() => ({
        title: document.title,
        text: document.body?.innerText?.slice(0, 500) ?? '',
        buttons: Array.from(document.querySelectorAll('button')).slice(0, 20).map((button) => button.textContent?.trim() ?? ''),
        inputs: Array.from(document.querySelectorAll('input')).slice(0, 20).map((input) => ({
          type: input.type,
          name: input.name,
          placeholder: input.placeholder,
          value: input.value,
        })),
      }))()
    `,
    returnByValue: true,
  });

  console.log(JSON.stringify(result.result.value, null, 2));

  await sleep(1000);
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
