import { Outlet } from 'react-router-dom';
import { SiteFooter } from '../components/SiteFooter.js';

/** Marketing pages under the shared platform nav. */
export function MarketingLayout() {
  return (
    <div className="mkt">
      <Outlet />
      <SiteFooter />
    </div>
  );
}
