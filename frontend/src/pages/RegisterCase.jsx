// RegisterCase.jsx — the form a family fills in to report a missing person.
//
// What happens when they press "Submit":
//   1. The photo is shrunk on the phone (fast upload on slow internet)
//   2. It's uploaded to Supabase Storage:  case-photos/<their-user-id>/<random-id>.jpg
//   3. A new row is saved in the missing_persons table with status "pending"
//   4. Police see it and approve it (Step 5). Only then do alerts go out.

import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'
import { randomId } from '../lib/randomId'
import { nowForInput } from '../lib/dates'
import { useAuth } from '../context/AuthContext'

// Load the map code only when this page opens
const LocationPicker = lazy(() => import('../components/LocationPicker.jsx'))

export default function RegisterCase() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // One state object holds all the text fields of the form
  const [form, setForm] = useState({
    full_name: '',
    age: '',
    gender: '',
    height_cm: '',
    description: '',
    last_seen_at: nowForInput(),
    last_seen_address: '',
  })
  const [point, setPoint] = useState(null)          // { lat, lng } chosen on the map
  const [photo, setPhoto] = useState(null)          // the shrunk photo, ready to upload
  const [photoPreview, setPhotoPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Updates one field, e.g. update('age', '12')
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  // When a photo is chosen: shrink it right away and show a preview
  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const small = await compressImage(file)
      setPhoto(small)
      setPhotoPreview(URL.createObjectURL(small))
    } catch (err) {
      setError(err.message)
    }
  }

  // Check the form before sending. Returns an error message, or '' if all good.
  function validate() {
    if (form.full_name.trim().length < 2) return 'Please enter the missing person’s full name.'
    if (form.age && (form.age < 0 || form.age > 120)) return 'Please enter a valid age.'
    if (form.height_cm && (form.height_cm < 30 || form.height_cm > 250)) return 'Height should be in centimetres (30–250).'
    if (!form.last_seen_at) return 'Please enter when they were last seen.'
    if (new Date(form.last_seen_at) > new Date()) return 'The last-seen time cannot be in the future.'
    if (!point) return 'Please tap the map where they were last seen.'
    if (!photo) return 'Please add a clear, recent photo of their face.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')

    // 1) Upload the photo into the user's own folder (the storage rules require this)
    const photoPath = `${user.id}/${randomId()}.jpg`
    const upload = await supabase.storage
      .from('case-photos')
      .upload(photoPath, photo, { contentType: 'image/jpeg' })

    if (upload.error) {
      setError('Photo upload failed: ' + upload.error.message)
      setBusy(false)
      return
    }

    // 2) Save the case. Empty optional fields are sent as null (meaning "unknown").
    const { error: insertError } = await supabase.from('missing_persons').insert({
      full_name: form.full_name.trim(),
      age: form.age === '' ? null : Number(form.age),
      gender: form.gender || null,
      height_cm: form.height_cm === '' ? null : Number(form.height_cm),
      description: form.description.trim() || null,
      last_seen_at: new Date(form.last_seen_at).toISOString(),
      last_seen_address: form.last_seen_address.trim() || null,
      last_seen_lat: point.lat,
      last_seen_lng: point.lng,
      photo_path: photoPath,
    })

    if (insertError) {
      // Don't leave an orphan photo behind if saving the case failed
      await supabase.storage.from('case-photos').remove([photoPath])
      setError('Could not save the case: ' + insertError.message)
      setBusy(false)
      return
    }

    // 3) Done! Go to the list of my cases
    navigate('/my-cases', { replace: true, state: { justCreated: true } })
  }

  const inputClass =
    'w-full border border-slate-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-900'
  const labelClass = 'block text-sm font-semibold mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold">Report a missing person</h2>

      {/* ---- Photo ---- */}
      <section className="bg-white rounded-xl p-4 shadow-sm space-y-2">
        <label className={labelClass}>Photo *</label>
        <p className="text-xs text-slate-500">A recent photo where the face is clear and facing the camera works best for face matching.</p>
        {photoPreview && (
          <img src={photoPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg" />
        )}
        <input type="file" accept="image/*" onChange={handlePhoto} className="block w-full text-sm" />
      </section>

      {/* ---- About the person ---- */}
      <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <label className={labelClass}>Full name *</label>
          <input className={inputClass} value={form.full_name} maxLength={100}
            onChange={(e) => update('full_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Age</label>
            <input className={inputClass} type="number" inputMode="numeric" min="0" max="120"
              value={form.age} onChange={(e) => update('age', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Height (cm)</label>
            <input className={inputClass} type="number" inputMode="numeric" min="30" max="250"
              value={form.height_cm} onChange={(e) => update('height_cm', e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Gender</label>
          <select className={inputClass} value={form.gender} onChange={(e) => update('gender', e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <textarea className={inputClass} rows="3" maxLength={2000}
            placeholder="Clothes they were wearing, marks, language spoken, medical needs…"
            value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>
      </section>

      {/* ---- Last seen ---- */}
      <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <label className={labelClass}>Last seen: date and time *</label>
          <input className={inputClass} type="datetime-local" max={nowForInput()}
            value={form.last_seen_at} onChange={(e) => update('last_seen_at', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Last seen: place on map *</label>
          <Suspense fallback={<div className="h-64 rounded-lg bg-slate-100 flex items-center justify-center text-sm text-slate-500">Loading map…</div>}>
            <LocationPicker value={point} onChange={setPoint} />
          </Suspense>
        </div>
        <div>
          <label className={labelClass}>Landmark / address</label>
          <input className={inputClass} maxLength={300} placeholder="e.g. Near bus stand, Anna Nagar"
            value={form.last_seen_address} onChange={(e) => update('last_seen_address', e.target.value)} />
        </div>
      </section>

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-3">{error}</p>}

      <button type="submit" disabled={busy}
        className="w-full bg-red-600 text-white rounded-xl py-4 font-semibold text-lg disabled:opacity-60 active:bg-red-700">
        {busy ? 'Submitting…' : 'Submit for police approval'}
      </button>
      <p className="text-xs text-slate-500 text-center">
        Alerts go out only after the police approve the case.
      </p>
    </form>
  )
}
