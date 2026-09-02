import { Outlet, useLocation } from 'react-router-dom';
import { PlatformNav } from '../components/PlatformNav.js';

/**
 * Shared shell so marketing ↔ trade keep the same top nav and feel continuous.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const isTrade = pathname.startsWith('/trade');
  const viewKey = isTrade ? 'trade' : pathname === '/' ? 'home' : 'marketing';

  return (
    <div className={`shell${isTrade ? ' shell-trade' : ' shell-marketing'}`}>
      <PlatformNav />
      <div key={viewKey} className="shell-view">
        <Outlet />
      </div>
    </div>
  );
}
