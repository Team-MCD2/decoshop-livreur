import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';

// Auth pages
const Login = lazy(() => import('./auth/Login'));
const SetupPin = lazy(() => import('./auth/SetupPin'));
const Unlock = lazy(() => import('./auth/Unlock'));

// Protected pages
const Home = lazy(() => import('./protected/Home'));
const BLDetail = lazy(() => import('./protected/BLDetail'));
const Calendar = lazy(() => import('./protected/Calendar'));
const Performance = lazy(() => import('./protected/Performance'));
const Profile = lazy(() => import('./protected/Profile'));

// 404
const NotFound = lazy(() => import('./NotFound'));

function PageLoader() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-cream">
      <div className="w-8 h-8 border-[3px] border-navy border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Routes publiques (non authentifiées) */}
        <Route path="/login" element={<Login />} />
        <Route path="/setup-pin" element={<SetupPin />} />
        <Route path="/unlock" element={<Unlock />} />

        {/* Routes protégées avec layout */}
        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Home />} />
          <Route path="/bl/:id" element={<BLDetail />} />
          <Route path="/calendrier" element={<Calendar />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/profil" element={<Profile />} />
        </Route>

        {/* Fallback */}
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
