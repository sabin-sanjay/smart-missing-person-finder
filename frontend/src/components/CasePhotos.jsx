// CasePhotos.jsx: extra photos of a missing person (up to 5).
// Everyone who can see the case sees them. The family who reported the case
// and the police can add or remove photos. The AI uses ALL of them when it
// compares sightings and "found someone" photos (see supabase/014).

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, casePhotoUrl } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'
import PhotoPicker from './PhotoPicker'

const MAX = 5

export default function CasePhotos({ caseId, canEdit, userId }) {
  const { t } = useTranslation()
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('case_photos').select('id, photo_path').eq('case_id', caseId).order('created_at')
    setPhotos(data ?? [])
  }, [caseId])

  useEffect(() => { load() }, [load])

  async function add(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const small = await compressImage(file)
      const path = `${userId}/${crypto.randomUUID?.() ?? Date.now()}.jpg`
      const up = await supabase.storage.from('case-photos').upload(path, small, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error: insertError } = await supabase.from('case_photos').insert({ case_id: caseId, photo_path: path })
      if (insertError) {
        await supabase.storage.from('case-photos').remove([path])
        throw insertError
      }
      load()
    } catch (err) {
      setError(t('photos.failed', { detail: err.message }))
    }
    setBusy(false)
    e.target.value = ''
  }

  async function remove(p) {
    await supabase.from('case_photos').delete().eq('id', p.id)
    await supabase.storage.from('case-photos').remove([p.photo_path]) // only works for your own uploads
    load()
  }

  if (!photos.length && !canEdit) return null

  return (
    <section className="bk-sheet space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">{t('photos.title')}</h3>
        <span className="badge">{photos.length}/{MAX}</span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <a href={casePhotoUrl(p.photo_path)} target="_blank" rel="noreferrer">
                <img src={casePhotoUrl(p.photo_path)} alt="" loading="lazy" className="w-full aspect-square object-cover rounded-2xl" />
              </a>
              {canEdit && (
                <button type="button" onClick={() => remove(p)} aria-label={t('photos.remove')}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white text-sm">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && photos.length < MAX && (
        <>
          <p className="text-xs text-white/60">{t('photos.hint')}</p>
          <PhotoPicker onChange={add} hasPhoto={false} />
          {busy && <p className="text-sm text-white/70">{t('photos.uploading')}</p>}
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
