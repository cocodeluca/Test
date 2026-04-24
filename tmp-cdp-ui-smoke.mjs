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

  const evalJS = async (expression, sessionId) => {
    const result = await send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
      },
      sessionId
    );
    return result.result.value;
  };

  const waitFor = async (predicateExpression, sessionId, timeoutMs = 25000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const value = await evalJS(predicateExpression, sessionId);
        if (value) {
          return value;
        }
      } catch {
        // Keep polling while the page is changing.
      }

      await sleep(300);
    }

    throw new Error(`Timed out waiting for: ${predicateExpression}`);
  };

  const clickText = async (text, sessionId) => {
    const clicked = await evalJS(
      `(() => {
        const target = Array.from(document.querySelectorAll('button, a'))
          .find((el) => (el.textContent || '').trim().includes(${JSON.stringify(text)}));
        if (!target) return false;
        target.click();
        return true;
      })()`,
      sessionId
    );

    if (!clicked) {
      throw new Error(`Could not find clickable text: ${text}`);
    }
  };

  const clickSelector = async (selector, sessionId) => {
    const clicked = await evalJS(
      `(() => {
        const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
          .find((el) => el instanceof HTMLElement && el.getClientRects().length > 0);
        if (!target) return false;
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
      })()`,
      sessionId
    );

    if (!clicked) {
      throw new Error(`Could not find selector: ${selector}`);
    }
  };

  const clickFirstEditButton = async (sessionId) => {
    const clicked = await evalJS(
      `(() => {
        const editButton = Array.from(document.querySelectorAll('button[title]'))
          .find((el) => el instanceof HTMLElement && el.getClientRects().length > 0 && /edit|editar/i.test(el.getAttribute('title') || ''));
        if (!editButton) return false;
        editButton.scrollIntoView({ block: 'center' });
        editButton.click();
        return true;
      })()`,
      sessionId
    );

    if (!clicked) {
      throw new Error('Could not find property edit button');
    }
  };

  const clickNavLabel = async (pattern, sessionId) => {
    const clicked = await evalJS(
      `(() => {
        const matcher = new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)});
        const target = Array.from(document.querySelectorAll('nav button'))
          .find((el) => el instanceof HTMLElement && el.getClientRects().length > 0 && matcher.test((el.textContent || '').trim()));
        if (!target) return false;
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
      })()`,
      sessionId
    );

    if (!clicked) {
      throw new Error(`Could not find nav label matching ${pattern}`);
    }
  };

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

  const shellReady = await waitFor(
    `Boolean(document.querySelector('[data-tutorial-id="nav-properties"]') || document.body.innerText.includes('Try demo account'))`,
    sessionId
  );

  if (!shellReady || !(await evalJS(`Boolean(document.querySelector('[data-tutorial-id="nav-properties"]'))`, sessionId))) {
    await clickText('Try demo account', sessionId);
    await waitFor(`Boolean(document.querySelector('[data-tutorial-id="nav-properties"]'))`, sessionId, 30000);
  }
  console.log('[smoke] dashboard ready');

  const propertiesPageReady = await evalJS(
    `Boolean(
      document.body &&
      (document.body.innerText.includes('Propiedades') ||
        document.body.innerText.includes('Properties') ||
        document.querySelector('[data-tutorial-id="properties-add"]'))
    )`,
    sessionId
  );

  if (!propertiesPageReady) {
    try {
      await clickSelector('[data-tutorial-id="nav-properties"]', sessionId);
    } catch {
      await clickNavLabel(/properties|propiedades/i, sessionId);
    }
    await waitFor(`Boolean(document.querySelector('[data-tutorial-id="properties-add"]'))`, sessionId, 30000);
  }
  console.log('[smoke] properties page ready');

  await clickSelector('[data-tutorial-id="properties-add"]', sessionId);
  await waitFor(`Boolean(document.querySelector('.modal-scroll-body'))`, sessionId, 10000);
  console.log('[smoke] create property modal open');

  await clickSelector('button[aria-label="Close editor"]', sessionId);
  await sleep(500);

  await clickFirstEditButton(sessionId);
  await waitFor(`Boolean(document.querySelector('.modal-scroll-body'))`, sessionId, 10000);
  console.log('[smoke] edit property modal open');

  const body = await evalJS(
    'document.body ? document.body.innerText.slice(0, 1200) : "NO_BODY"',
    sessionId
  );
  console.log('[body]', body);

  ws.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
