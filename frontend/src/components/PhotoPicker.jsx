// PhotoPicker.jsx: a big, easy-to-tap "Add a photo" button.
// (The browser's built-in file box is tiny text like "Choose File", easy to miss.)
//
// We don't force the camera: phones then offer a choice of
// "Take Photo" or "Photo Library" (iPhone) / "Camera" or "Files" (Android).

export default function PhotoPicker({ onChange, disabled, hasPhoto, text = '📷 Add a photo', changeText = '📷 Change photo' }) {
  return (
    <label className={`flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed px-4 py-3 font-semibold
      ${disabled ? 'opacity-50' : 'cursor-pointer active:bg-blue-50'}
      ${hasPhoto ? 'border-slate-300 text-slate-600' : 'border-blue-900 text-blue-900'}`}>
      {hasPhoto ? changeText : text}
      {/* The real file box is hidden; tapping the label opens it */}
      <input type="file" accept="image/*" onChange={onChange} disabled={disabled} className="sr-only" />
    </label>
  )
}
