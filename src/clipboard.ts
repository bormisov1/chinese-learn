export async function copyText(text: string) {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard) { await clipboard.writeText(text); return; }
  if (typeof document === 'undefined') return;
  const input = document.createElement('textarea');
  input.value = text;
  input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
}
