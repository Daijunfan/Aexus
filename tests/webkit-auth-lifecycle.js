// Native macOS WebKit authentication lifecycle driver.
//
// Injected with `forMainFrameOnly = false` into every frame of a WKWebView, so the
// CloudHosts shell (`#agent-board-mode`, `#role-board-mode`, `[data-role-view=…]`)
// and the cross-origin hosted Aexus Core frame (`?aexus-host=cloudhosts`) are both
// driven by the real product code. Nothing here re-implements authentication: it
// only records what the real client actually sends and receives, and clicks the
// real UI. No 4xx is ever suppressed.
//
// Reporting goes through a WKScriptMessageHandler named `aexusAuth` because the
// hosted frame is cross-origin and cannot be reached from the shell document.
//
// Two rules keep the evidence honest:
//   * the shell document never reports a frame's lifecycle — only the frame's own
//     document may, so a shell-side placeholder can never be read as a frame write;
//   * every step that can be observed without a DOM timer is reported without one,
//     because WebKit suspends the DOM timer queue in a cross-origin child frame
//     whose page is not visible, which is the environment a hidden-window harness
//     runs in. Waits therefore also advance on the posted-message queue.
(() => {
  if (window.__aexusAuth) return;
  const bridge = (() => { try { return window.webkit?.messageHandlers?.aexusAuth || null } catch { return null } })();
  const post = payload => { try { bridge?.postMessage(payload) } catch {} };
  const isHostedFrame = location.search.includes('aexus-host=cloudhosts');
  const state = {
    role: isHostedFrame ? 'core' : 'shell',
    http: [],
    navigation: [],
    messages: [],
    teams: [],
    groups: [],
    errors: [],
    apiRequests: 0,
    ready: false,
    companyNavigationReady: false,
    navigationAcknowledged: []
  };
  window.__aexusAuth = state;

  // A CloudHosts window keeps its browser client id for its whole session, and the
  // Core scopes the hosted session cookie to that client
  // (`ui/aexus-embed.js` getClient, `auth.ts` cookieName). A retained phase
  // re-creates that window identity so the cookie the native store kept is
  // presented again for real; this never creates, edits or replays a cookie.
  if (state.role === 'shell') {
    try {
      if (window.__aexusRetainedClientId) sessionStorage.setItem('cloudhosts-aexus-client', window.__aexusRetainedClientId);
    } catch {}
  }

  // A DOM timer is not a reliable clock in this environment; the posted-message
  // queue is a different task source and keeps running when the page is hidden.
  const deliverWait = (() => {
    try {
      const channel = new MessageChannel();
      const waits = new Map();
      let serial = 0;
      channel.port1.onmessage = event => {
        const entry = waits.get(event.data);
        if (!entry) return;
        if (performance.now() >= entry.deadline) { waits.delete(event.data); entry.resolve() }
        else channel.port2.postMessage(event.data);
      };
      channel.port2.postMessage(0);
      return ms => new Promise(resolve => {
        const timer = setTimeout(() => { waits.delete(serial); resolve() }, ms);
        const key = ++serial;
        waits.set(key, { deadline: performance.now() + ms, resolve: () => { clearTimeout(timer); resolve() } });
        channel.port2.postMessage(key);
      });
    } catch {
      return ms => new Promise(resolve => setTimeout(resolve, ms));
    }
  })();
  const sleep = ms => deliverWait(ms);
  const record = entry => {
    state.http.push(entry);
    state.apiRequests = (state.apiRequests || 0) + 1;
    if (entry.status >= 400 || entry.rejected) post({ kind: 'http', ...entry });
  };
  const headerValue = (headers, name) => {
    if (!headers) return null;
    try { if (typeof headers.get === 'function') return headers.get(name) } catch {}
    for (const key of Object.keys(headers)) if (key.toLowerCase() === name) return String(headers[key]);
    return null;
  };
  // The Core answers an authenticated RPC with HTTP 200 and `{ok:false}` when it
  // refuses a mutation, so the status code alone is not enough evidence.
  const inspect = (url, response, request) => {
    let path;
    try { path = new URL(url, location.href).pathname } catch { path = String(url) }
    if (!/\/api\//.test(path)) return;
    const entry = {
      frame: state.role,
      method: request.method || 'GET',
      path,
      status: response.status,
      csrf: !!headerValue(request.headers, 'x-agents-csrf'),
      client: headerValue(request.headers, 'x-agents-client'),
      request: request.body ? String(request.body).slice(0, 400) : null,
      rejected: false,
      body: null
    };
    // The startup probe every frame makes. Its answer is the difference between
    // "the native store kept the session and the Core honored it" and "the window
    // had to be provisioned from scratch", so it is reported whatever the status.
    if (path === '/api/bootstrap')
      post({ kind: 'bootstrap', frame: state.role, status: response.status, client: entry.client, origin: location.origin });
    if (response.status >= 400) {
      response.clone().text().then(
        text => record({ ...entry, body: text.slice(0, 300) }),
        () => record(entry)
      );
      return;
    }
    if (!/\/api\/rpc$/.test(path)) { record(entry); return }
    response.clone().json().then(payload => {
      const rejected = !!payload && payload.ok === false;
      record({ ...entry, rejected, body: rejected ? String(payload.error).slice(0, 300) : null });
    }, () => record(entry));
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const request = {
        method: (init && init.method) || (input && input.method) || 'GET',
        headers: (init && init.headers) || (input && input.headers) || null,
        body: init && init.body
      };
      const promise = originalFetch.apply(this, arguments);
      promise.then(response => inspect(url, response, request), () => {});
      return promise;
    };
  }
  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR && OriginalXHR.prototype) {
    const open = OriginalXHR.prototype.open, send = OriginalXHR.prototype.send;
    OriginalXHR.prototype.open = function (method, url) {
      try { this.__aexusAuthRequest = { method, url, headers: null, body: null } } catch {}
      return open.apply(this, arguments);
    };
    OriginalXHR.prototype.send = function (body) {
      try {
        const tracked = this.__aexusAuthRequest;
        if (tracked) { tracked.body = body; this.addEventListener('loadend', () => inspect(tracked.url, { status: this.status, clone: () => this.responseText, json: async () => JSON.parse(this.responseText) }, tracked)) }
      } catch {}
      return send.apply(this, arguments);
    };
  }

  const progress = (step, detail) => post({ kind: 'progress', frame: state.role, step, detail: detail == null ? null : String(detail) });
  const fail = message => {
    state.errors.push(String(message));
    post({ kind: 'error', frame: state.role, message: String(message) });
  };
  window.addEventListener('error', event => fail(event.message));
  window.addEventListener('unhandledrejection', event => fail(event.reason));

  const wait = async (predicate, timeout) => {
    const deadline = Date.now() + (timeout || 45000);
    while (Date.now() < deadline) {
      try { if (predicate()) return true } catch {}
      await sleep(80);
    }
    return false;
  };
  // React tracks the node's own value descriptor, so a plain `element.value = x`
  // would be swallowed and the controlled form would never update. Drive the
  // native setter exactly like a real keystroke then dispatch the real events.
  const setValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const click = selector => {
    const element = document.querySelector(selector);
    if (!element) throw Error('missing UI element ' + selector);
    element.click();
    return element;
  };

  // ---------------------------------------------------------------- core frame
  // What the frame document holds right now: enough to tell "the host exchange
  // never completed" apart from "the application is slow" without suppressing
  // anything the real client reports.
  const frameState = () => {
    const text = node => (node && node.innerText ? node.innerText.replace(/\s+/g, ' ').trim().slice(0, 240) : null);
    const client = (() => { try { return window.agents || null } catch { return null } })();
    const root = document.documentElement;
    const mount = document.querySelector('.app, #root, #app, body');
    return {
      href: location.href,
      readyState: document.readyState,
      visibility: document.visibilityState,
      hidden: document.hidden,
      embedded: root.dataset.cloudhostsEmbedded || null,
      presentation: root.dataset.presentation || null,
      hasClient: !!client && typeof client.call === 'function',
      clientId: client ? client.clientId || null : null,
      authenticated: client && 'authenticated' in client ? !!client.authenticated : null,
      rootChildren: mount ? mount.children.length : -1,
      classes: Array.from(document.querySelectorAll('body *')).slice(0, 14).map(node => String(node.className).slice(0, 36)),
      messages: state.messages.slice(-12),
      navigation: state.navigation.slice(-6),
      text: text(document.body),
      errors: state.errors.slice(-2)
    };
  };
  // One report per hosted frame document: a real re-entry, reload or new window
  // each produce a new document and therefore a new genuine write through the
  // real Team form plus real settings writes on the real client transport.
  const frameReport = { done: false, value: null, error: null };
  const coreReport = (async () => {
    if (state.role !== 'core') return null;
    // Every host-to-frame message this document received, so a missing host
    // handshake is visible as such instead of looking like a slow render. These
    // posts are synchronous with the event, never scheduled on a timer.
    window.addEventListener('message', event => {
      const data = event.data;
      if(event.source===window.parent&&data?.aexusAuthProbe==='navigation-checkpoint'){
        window.parent.postMessage({aexusAuthProbe:'navigation-request',id:state.navigationRequestId},event.origin);return;
      }
      if(event.source===window.parent&&data?.aexusAuthProbe==='company-ready'){
        state.companyNavigationReady=true;return;
      }
      const type = data && typeof data === 'object' ? (data.type || data.protocolVersion || 'unknown') : typeof data;
      state.messages.push(String(type));
      post({ kind: 'frame-message', frame: 'core', type: String(type) });
      if (data && data.type === 'navigation.change' && data.payload && data.payload.view) {
        state.navigationRequestId=data.requestId;
        state.navigation.push(data.payload.view);
        post({ kind: 'frame-navigation', frame: 'core', view: String(data.payload.view) });
      }
    });
    progress('frame-document', location.href);
    if (!(await wait(() => window.agents && typeof window.agents.call === 'function', 90000)))
      throw Error('hosted Core client never attached inside the native frame');
    progress('frame-client-attached');
    // The state of the document the moment the client exists — taken before any
    // wait, so a frozen frame is distinguishable from a stalled handshake.
    post({ kind: 'frame-state', frame: 'core', detail: JSON.stringify(frameState()) });
    // Which task source still runs in this document. A hidden cross-origin child
    // frame can lose its DOM timer queue while I/O and message tasks survive, and
    // a silent frame would otherwise be indistinguishable from a slow render.
    const probe = step => post({ kind: 'probe', frame: 'core', step });
    setTimeout(() => probe('timer-0'), 0);
    setTimeout(() => probe('timer-5s'), 5000);
    let pulses = 0;
    const interval = setInterval(() => { pulses += 1; probe('interval-' + pulses); if (pulses >= 2) clearInterval(interval) }, 5000);
    try { requestAnimationFrame(() => probe('raf')) } catch {}
    try { new MutationObserver(() => probe('mutation')).observe(document.documentElement, { childList: true, subtree: true }) } catch {}
    // The host drives the visible presentation, so the mount assertion must not
    // depend on a company-only element: `data-presentation` is written by the real
    // application the moment it mounts, whatever the host has selected.
    if (!(await wait(() => document.documentElement.dataset.presentation, 60000)))
      throw Error('hosted Core application never mounted inside the native frame :: ' + JSON.stringify(frameState()));
    progress('frame-mounted', document.documentElement.dataset.presentation);
    // A rejected or hung RPC must be reported as such instead of stalling the
    // whole phase, so a stalled lifecycle is never mistaken for slow progress.
    const call = (command, args) => Promise.race([
      window.agents.call(command, args || {}),
      new Promise((resolve, reject) => setTimeout(() => reject(Error('RPC ' + command + ' did not settle within 30s')), 30000))
    ]);
    state.nativeClient = window.agents.clientId || null;
    await call('settings.set', { language: 'en' });
    progress('frame-settings-language');
    await call('settings.set', { showTeamOverview: false });
    progress('frame-settings-written');
    const before = await call('group.list');
    progress('frame-groups-read', before.length);
    // The host restores the window's last view and then applies the tab the shell
    // clicked. When the restore lands after that navigation the document is left on
    // a view the host has already left — and only Company carries `.add-team`, so
    // the real write cannot start. That is a product failure, not a condition to
    // compensate for: the harness records the received navigations and the view the
    // document is stuck on, then fails the phase rather than re-issuing the host's
    // tab click for it. A mismatch must fail; it is never re-tried into a pass.
    if (!(await wait(() => document.querySelector('.add-team'), 30000))) {
      post({ kind: 'frame-nav-mismatch', frame: 'core',
             view: document.documentElement.dataset.presentation || null, navigation: state.navigation.slice() });
      throw Error('real Team form trigger never appeared inside the native frame :: ' + JSON.stringify(frameState()));
    }
    // The shell has one planned Company selection. Do not open the form while
    // that navigation is still running: it would close our own just-opened form.
    if(!(await wait(()=>state.companyNavigationReady,30000)))
      throw Error('shell Company selection was not acknowledged before the form action');
    progress('frame-form-trigger-ready', 'first try after Company acknowledgement');
    click('.add-team');
    progress('frame-form-opened');
    if (!(await wait(() => document.querySelector('.team-form'), 30000)))
      throw Error('real Team form never opened inside the native frame');
    const form = document.querySelector('.team-form');
    const token = String(Date.now());
    const name = 'Native lifecycle ' + (before.length + 1) + ' ' + token;
    setValue(form.querySelector('[name=team-name]'), name);
    const local = form.querySelector('[data-environment=local]');
    if (local) local.click();
    progress('frame-form-filled', name);
    // The form opens with an empty title, so the real backend resolves an
    // automatic directory for the placeholder first and re-resolves it once the
    // name is typed. A user watches the field settle before saving; wait for the
    // directory that belongs to *this* Team, not merely for any value, so the
    // form never submits the placeholder directory.
    const rootValue = () => (form.querySelector('[name=team-root]') || {}).value || '';
    if (!(await wait(() => rootValue().includes(token), 60000)))
      throw Error('Team form never resolved the automatic directory for "' + name + '" through the real backend (root=' + rootValue() + ')');
    await sleep(700);
    if (!rootValue().includes(token))
      throw Error('Team directory for "' + name + '" was replaced before the write (root=' + rootValue() + ')');
    form.querySelector('.save-team').click();
    progress('frame-form-submitted');
    if (!(await wait(() => !document.querySelector('.team-form'), 90000))) {
      const visible = Array.from(form.querySelectorAll('small, [role=alert], .field-error, .form-error'))
        .map(node => node.textContent.trim()).filter(text => text).slice(0, 4).join(' / ');
      throw Error('Team form stayed open: the real write did not complete :: ' + (visible || 'no visible error'));
    }
    const groups = await call('group.list');
    progress('frame-team-created', name);
    state.teams.push(name);
    state.groups = groups;
    return {
      teams: [name], groups, teamsCreated: groups.includes(name),
      client: state.nativeClient, href: location.href,
      apiRequests: state.apiRequests, navigation: state.navigation.slice()
    };
  })();
  coreReport.then(
    value => {
      if (value === null) return;
      frameReport.value = value;
      frameReport.done = true;
      post({ kind: 'frame', frame: 'core', ...value });
    },
    error => {
      frameReport.error = error.message;
      frameReport.done = true;
      post({ kind: 'frame-error', frame: 'core', message: error.message });
    }
  );
  state.frameReport = frameReport;

  // ---------------------------------------------------------------- shell side
  // The shell owns the outer tabs and never asserts a frame write itself: the
  // frame's own report is the evidence, read by the harness process.
  if(state.role==='shell')window.addEventListener('message',event=>{
    if(event.source!==document.querySelector('iframe')?.contentWindow)return;
    const data=event.data;
    if(data?.aexusAuthProbe==='navigation-request')state.companyRequestId=data.id;
    if(data?.type==='navigation.change'&&data.payload?.accepted===true&&data.payload.view==='company')
      state.navigationAcknowledged.push(data.requestId);
  });
  const shell = {
    async open() {
      progress('shell-open-clicked');
      click('#role-board-mode');
      if (!(await wait(() => window.cloudHosts?.roleBoard?.ready === true, 90000)))
        throw Error('Role Board never became ready in native WebKit');
      progress('shell-role-board-ready');
      if (!(await wait(() => document.querySelector('[data-role-view="company"]'), 30000)))
        throw Error('Role Board never rendered its Company tab');
      state.companyRequestId=null;
      click('[data-role-view="company"]');
      const frame=document.querySelector('iframe'),origin=new URL(frame.src,location.href).origin;
      // postMessage ordering puts this checkpoint after the single navigation;
      // the frame echoes that exact request id, which we match to the real ACK.
      frame.contentWindow.postMessage({aexusAuthProbe:'navigation-checkpoint'},origin);
      if(!(await wait(()=>state.companyRequestId&&state.navigationAcknowledged.includes(state.companyRequestId),30000)))
        throw Error('hosted Core never acknowledged the opening Company selection');
      frame.contentWindow.postMessage({aexusAuthProbe:'company-ready'},origin);
      progress('shell-company-navigation-acknowledged',state.companyRequestId);
      return {
        ready: true,
        clientId: window.cloudHosts.roleBoard.clientId,
        instanceId: window.cloudHosts.roleBoard.instanceId,
        iframes: document.querySelectorAll('iframe').length
      };
    },
    async tabs() {
      const seen = [];
      for (const view of ['company', 'messages', 'plan']) {
        const since = Date.now();
        click('[data-role-view="' + view + '"]');
        if (!(await wait(() => window.cloudHosts.roleBoard.trace.some(
          row => row.at >= since && row.event === 'received' && row.type === 'navigation.change' && row.view === view), 30000)))
          throw Error('hosted Core never acknowledged navigation to ' + view);
        seen.push(view);
      }
      return {
        views: seen,
        hostAcknowledged: true,
        iframes: document.querySelectorAll('iframe').length,
        clientId: window.cloudHosts.roleBoard.clientId,
        instanceId: window.cloudHosts.roleBoard.instanceId
      };
    },
    // Leave Role Board entirely and come back: the real re-entry path.
    async cycle() {
      click('#agent-board-mode');
      if (!(await wait(() => document.querySelector('.agent-grid'), 45000)))
        throw Error('Agent Board did not render after leaving Role Board');
      const detached = await wait(() => document.querySelectorAll('iframe').length === 0, 15000);
      click('#role-board-mode');
      const opened = await shell.open();
      return { ...opened, agentBoardDetachedFrame: detached };
    },
    async single() {
      click('#single-mode');
      if (!(await wait(() => document.querySelector('[data-view="roles"]'), 30000)))
        throw Error('Single Host did not expose the Role subpage');
      click('[data-view="roles"]');
      if (!(await wait(() => document.querySelector('.role-host-pane'), 45000)))
        throw Error('Single Host Role subpage did not mount');
      click('#role-board-mode');
      return await shell.open();
    },
    async probe() {
      const active = document.querySelector('.mode-switch button.active');
      return {
        mode: active ? active.textContent : null,
        iframes: document.querySelectorAll('iframe').length,
        roleBoardReady: window.cloudHosts?.roleBoard?.ready === true,
        trace: (window.cloudHosts?.roleBoard?.trace || []).slice(-8)
      };
    }
  };

  window.__aexusAuth.segment = async name => {
    if (!(name in shell)) throw Error('unknown shell segment ' + name);
    const value = await shell[name]();
    post({ kind: 'segment', segment: name, value });
    return value;
  };
  state.ready = true;
  post({ kind: 'ready', frame: state.role, href: location.href });
})();
