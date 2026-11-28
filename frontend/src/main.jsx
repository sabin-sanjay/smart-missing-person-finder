// main.jsx
// This is where the app starts. It sets up translations, the pages (routes),
// and draws the app inside the <div id="root"> in index.html.

import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
// Figtree: the app's font, stored inside the app (no Google Fonts call).
// One small file covers every weight; Hindi uses the phone's Devanagari font.
import '@fontsource-variable/figtree'
import './index.css'
import './i18n' // load translations before anything is shown
import { setupHaptics } from './lib/haptics'

import { setupAppUpdates } from './lib/appUpdate'

// Short vibration when important buttons are tapped (Android phones)
setupHaptics()
// Pick up new versions of the app by itself (see lib/appUpdate.js)
setupAppUpdates()

import { AuthProvider } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'

// AFTER AN UPDATE: each new version gives the page files new names, and the old
// ones are removed. A phone that still has the OLD version open would then fail to
// open a page ("Failed to fetch dynamically imported module"). When that happens,
// reload once to get the new version. (The flag stops endless reloading if the
// internet is simply off.)
function reloadForNewVersion() {
  const key = 'lumen-reloaded-for-update'
  if (Date.now() - Number(sessionStorage.getItem(key) || 0) > 10000) {
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
    return true
  }
  return false
}
// Vite announces it when a page file can't be fetched
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})
// Like lazy(), but reloads the app if the page file is gone after an update
const lazyPage = (load) =>
  lazy(() => load().catch((err) => {
    if (reloadForNewVersion()) return new Promise(() => {}) // wait for the reload
    throw err
  }))

// SPEED: only Home is downloaded when the app first opens. Every other page
// is downloaded the first time someone opens it ("lazy loading"). Most visitors
// only need Home, a case page and the sighting form, so police/admin code,
// maps and PDFs never cost them any data.
const MapPage = lazyPage(() => import('./pages/MapPage.jsx'))
const ReportSighting = lazyPage(() => import('./pages/ReportSighting.jsx'))
const CaseView = lazyPage(() => import('./pages/CaseView.jsx'))
const FaceSearch = lazyPage(() => import('./pages/FaceSearch.jsx'))
const FoundSomeone = lazyPage(() => import('./pages/FoundSomeone.jsx'))
const SafetyCard = lazyPage(() => import('./pages/SafetyCard.jsx'))
const Sos = lazyPage(() => import('./pages/Sos.jsx'))
const PoliceFound = lazyPage(() => import('./pages/PoliceFound.jsx'))
const PoliceVideo = lazyPage(() => import('./pages/PoliceVideo.jsx'))
const Login = lazyPage(() => import('./pages/Login.jsx'))
const ResetPassword = lazyPage(() => import('./pages/ResetPassword.jsx'))
const Profile = lazyPage(() => import('./pages/Profile.jsx'))
const MyCases = lazyPage(() => import('./pages/MyCases.jsx'))
const RegisterCase = lazyPage(() => import('./pages/RegisterCase.jsx'))
const PoliceDashboard = lazyPage(() => import('./pages/PoliceDashboard.jsx'))
const PoliceCaseDetail = lazyPage(() => import('./pages/PoliceCaseDetail.jsx'))
const PoliceAnalytics = lazyPage(() => import('./pages/PoliceAnalytics.jsx'))
const AdminDashboard = lazyPage(() => import('./pages/AdminDashboard.jsx'))
const NotFound = lazyPage(() => import('./pages/NotFound.jsx'))

// Shown for a moment while a page's code downloads
const loading = <p className="text-muted text-sm">…</p>
const page = (element) => <Suspense fallback={loading}>{element}</Suspense>
const loggedIn = (element, roles) => page(<ProtectedRoute roles={roles}>{element}</ProtectedRoute>)

// The list of pages. "path" is what appears after the website address.
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />, // the shared top bar + bottom menu around every page
    children: [
      // Open to everyone
      { index: true, element: <Home /> },
      { path: 'map', element: page(<MapPage />) },
      { path: 'safety-card', element: page(<SafetyCard />) },
      { path: 'sos', element: page(<Sos />) },
      { path: 'case/:id', element: page(<CaseView />) },
      { path: 'login', element: page(<Login />) },
      { path: 'reset-password', element: page(<ResetPassword />) },

      // Any logged-in user (sightings need a login so police can contact the reporter)
      { path: 'profile', element: loggedIn(<Profile />) },
      { path: 'report', element: loggedIn(<ReportSighting />) },
      { path: 'who-is-this', element: loggedIn(<FaceSearch />) },
      { path: 'found-someone', element: loggedIn(<FoundSomeone />) },

      // Families (police and admin may also register cases, e.g. walk-in reports)
      { path: 'my-cases', element: loggedIn(<MyCases />, ['family', 'police', 'admin']) },
      { path: 'my-cases/new', element: loggedIn(<RegisterCase />, ['family', 'police', 'admin']) },

      // Police and admin
      { path: 'police', element: loggedIn(<PoliceDashboard />, ['police', 'admin']) },
      { path: 'police/case/:id', element: loggedIn(<PoliceCaseDetail />, ['police', 'admin']) },
      { path: 'police/analytics', element: loggedIn(<PoliceAnalytics />, ['police', 'admin']) },
      { path: 'police/found', element: loggedIn(<PoliceFound />, ['police', 'admin']) },
      { path: 'police/video', element: loggedIn(<PoliceVideo />, ['police', 'admin']) },

      // Admin only
      { path: 'admin', element: loggedIn(<AdminDashboard />, ['admin']) },

      { path: '*', element: page(<NotFound />) }, // any unknown address
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* AuthProvider wraps everything so every page knows who is logged in */}
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
