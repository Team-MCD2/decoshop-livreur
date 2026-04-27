import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { OfflineBanner } from './OfflineBanner';

/**
 * Layout principal de l'app authentifiée.
 *  - Mobile (< lg) : Header + main + BottomNav
 *  - Desktop (>= lg) : Sidebar + main (pas de bottom nav)
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh flex bg-cream">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        <Header />
        <main className="flex-1 pb-20 lg:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
