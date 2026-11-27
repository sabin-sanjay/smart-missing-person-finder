// main.jsx
// This is where the app starts. It sets up translations, the pages (routes),
// and draws the app inside the <div id="root"> in index.html.

import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
// Premium font, stored inside the app (no Google Fonts call). One 32 KB file
// covers every weight; Hindi text uses the phone's own Devanagari font.
import '@fontsource-variable/outfit'
// Geist Mono (23 KB): labels, chips, buttons, menu and big numbers
import '@fontsource-variable/geist-mono'
import './index.css'
import './i18n' // load translations before anything is shown

import { AuthProvider } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'

// SPEED: only Home is downloaded when the app first opens. Every other page
// is downloaded the first time someone opens it ("lazy loading"). Most visitors
// only need Home, a case page and the sighting form, so police/admin code,
// maps and PDFs never cost them any data.
const MapPage = lazy(() => import('./pages/MapPage.jsx'))
const ReportSighting = lazy(() => import('./pages/ReportSighting.jsx'))
const CaseView = lazy(() => import('./pages/CaseView.jsx'))
const FaceSearch = lazy(() => import('./pages/FaceSearch.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const MyCases = lazy(() => import('./pages/MyCases.jsx'))
const RegisterCase = lazy(() => import('./pages/RegisterCase.jsx'))
const PoliceDashboard = lazy(() => import('./pages/PoliceDashboard.jsx'))
const PoliceCaseDetail = lazy(() => import('./pages/PoliceCaseDetail.jsx'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

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
      { path: 'case/:id', element: page(<CaseView />) },
      { path: 'login', element: page(<Login />) },
      { path: 'reset-password', element: page(<ResetPassword />) },

      // Any logged-in user (sightings need a login so police can contact the reporter)
      { path: 'profile', element: loggedIn(<Profile />) },
      { path: 'report', element: loggedIn(<ReportSighting />) },
      { path: 'who-is-this', element: loggedIn(<FaceSearch />) },

      // Families (police and admin may also register cases, e.g. walk-in reports)
      { path: 'my-cases', element: loggedIn(<MyCases />, ['family', 'police', 'admin']) },
      { path: 'my-cases/new', element: loggedIn(<RegisterCase />, ['family', 'police', 'admin']) },

      // Police and admin
      { path: 'police', element: loggedIn(<PoliceDashboard />, ['police', 'admin']) },
      { path: 'police/case/:id', element: loggedIn(<PoliceCaseDetail />, ['police', 'admin']) },

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
