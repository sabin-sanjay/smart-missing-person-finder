// worker.js: runs on Cloudflare in front of the app.
//
// LINK PREVIEWS: when a case link (https://lumen.../case/<id>) is shared on
// WhatsApp, Telegram, Facebook..., those apps read the page's "og:" tags to
// draw a preview card. The app itself is drawn by JavaScript, which those
// apps don't run, so here we add the tags ourselves: the person's name, a
// short line, and their photo.
//
// Only PUBLIC cases (active or found) get a preview - the same ones anyone
// can already see in the app. Everything else is served unchanged.
// The Supabase "publishable" key used here is the public one (safe to share).

const CASE_PATH = /^\/case\/([0-9a-f-]{36})\/?$/i

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function loadCase(id, env) {
  const url = `${env.SUPABASE_URL}/rest/v1/missing_persons?id=eq.${id}&status=in.(active,found)` +
    '&select=full_name,age,status,photo_path,last_seen_address&limit=1'
  const res = await fetch(url, { headers: { apikey: env.SUPABASE_KEY }, cf: { cacheTtl: 60 } })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] || null
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const match = url.pathname.match(CASE_PATH)
    const page = await env.ASSETS.fetch(request) // the normal app page
    if (!match) return page

    let c = null
    try { c = await loadCase(match[1], env) } catch { /* no preview, page still works */ }
    if (!c) return page

    const name = c.full_name + (c.age != null ? `, ${c.age}` : '')
    const title = c.status === 'found' ? `Found: ${name}` : `MISSING: ${name}`
    const description = c.status === 'found'
      ? 'Reunited. Thank you to everyone who helped look.'
      : `Last seen${c.last_seen_address ? ` near ${c.last_seen_address}` : ''}. Seen this person? Tap to report a sighting on Lumen.`
    const image = c.photo_path
      ? `${env.SUPABASE_URL}/storage/v1/object/public/case-photos/${c.photo_path}`
      : `${url.origin}/pwa-512x512.png`

    const tags = [
      ['og:type', 'website'], ['og:site_name', 'Lumen'], ['og:url', url.href],
      ['og:title', title], ['og:description', description], ['og:image', image],
      ['twitter:card', 'summary_large_image'], ['twitter:title', title],
      ['twitter:description', description], ['twitter:image', image],
    ].map(([k, v]) => `<meta property="${k}" content="${escape(v)}">`).join('')

    return new HTMLRewriter()
      .on('meta[property^="og:"]', { element(el) { el.remove() } })   // drop the home page's default preview
      .on('title', { element(el) { el.setInnerContent(`${escape(title)} · Lumen`, { html: true }) } })
      .on('meta[name="description"]', { element(el) { el.setAttribute('content', description) } })
      .on('head', { element(el) { el.append(tags, { html: true }) } })
      .transform(page)
  },
}
