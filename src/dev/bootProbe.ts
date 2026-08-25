// Dev-only boot probe. Collects window errors, unhandled rejections and
// console.error calls into a hidden DOM node so headless runs (tools/appshot.mjs
// --gate) can assert a route rendered without runtime errors.
//
// Wired from src/main.tsx only when import.meta.env.DEV — never in production.

export function installBootProbe(): void {
  if (document.getElementById('ff-probe')) return;

  const errors: string[] = [];
  // Created EAGERLY so a clean run still exposes data-error-count="0" for the gate.
  const el = document.createElement('div');
  el.id = 'ff-probe';
  el.style.display = 'none';
  el.setAttribute('data-error-count', '0');
  el.setAttribute('data-errors', '');
  document.body.appendChild(el);

  const report = (msg: string) => {
    errors.push(msg.slice(0, 300));
    el.setAttribute('data-error-count', String(errors.length));
    el.setAttribute('data-errors', errors.slice(-20).join(' ⏐ '));
  };

  window.addEventListener('error', (e) => report(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) =>
    report(`rejection: ${String((e as PromiseRejectionEvent).reason)}`),
  );
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    report(`console.error: ${args.map((a) => String(a)).join(' ').slice(0, 300)}`);
    origError(...args);
  };
}
