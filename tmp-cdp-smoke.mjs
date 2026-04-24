const DEBUG_JSON_VERSION = 'http://127.0.0.1:9222/json/version';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
};

const main = async () => {
  const { webSocketDebuggerUrl } = await fetchJson(DEBUG_JSON_VERSION);
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  const send = (method, params = {}, sessionId = undefined) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message || 'CDP error'));
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    const logPrefix = message.sessionId ? `[session:${message.sessionId}]` : '[browser]';

    if (message.method === 'Runtime.consoleAPICalled') {
      const args = (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
      console.log(`${logPrefix} console.${message.params.type} ${args}`);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      console.log(`${logPrefix} exception ${JSON.stringify(message.params.exceptionDetails, null, 2)}`);
      return;
    }

    if (message.method === 'Log.entryAdded') {
      console.log(`${logPrefix} log ${JSON.stringify(message.params.entry, null, 2)}`);
      return;
    }

    if (message.method === 'Page.javascriptDialogOpening') {
      console.log(`${logPrefix} dialog ${JSON.stringify(message.params, null, 2)}`);
      return;
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const { targetId } = await send('Target.createTarget', {
    url: 'about:blank',
    newWindow: false,
  });
  const { sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: 'http://127.0.0.1:8081' }, sessionId);

  await sleep(8000);

  const result = await send(
    'Runtime.evaluate',
    {
      expression: 'document.body ? document.body.innerText.slice(0, 1200) : "NO_BODY"',
      returnByValue: true,
    },
    sessionId
  );
  console.log('[body]', result.result.value);

  ws.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
