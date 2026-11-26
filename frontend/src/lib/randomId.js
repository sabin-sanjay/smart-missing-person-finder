// randomId.js
// A long random name for uploaded photo files, so nobody can guess them.
// crypto.randomUUID only works on https:// or localhost, so there's a backup
// for when you test on a phone over plain http://192.168...
export function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
