import { Link } from 'react-router-dom';

/** Site-wide marketing footer — product / company / legal columns. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mkt-site-footer">
      <div className="mkt-site-footer-inner">
        <div className="mkt-site-footer-brand">
          <Link to="/" className="mkt-brand">
            <span className="mkt-brand-mark" aria-hidden="true" />
            DEX
          </Link>
          <p>
            Global digital asset exchange for spot and perpetual markets. Live depth, institutional-grade
            matching, wallet-native access.
          </p>
          <div className="mkt-site-footer-status">
            <span className="mkt-live-dot" />
            All systems operational
          </div>
        </div>

        <div className="mkt-site-footer-cols">
          <div>
            <h3>Products</h3>
            <ul>
              <li>
                <Link to="/trade">Trading terminal</Link>
              </li>
              <li>
                <Link to="/markets">Markets</Link>
              </li>
              <li>
                <Link to="/portfolio">Portfolio</Link>
              </li>
              <li>
                <Link to="/trade/BTC-PERP">Perpetuals</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Resources</h3>
            <ul>
              <li>
                <Link to="/docs">Help center</Link>
              </li>
              <li>
                <Link to="/docs#fees">Fees</Link>
              </li>
              <li>
                <Link to="/docs#risk">Risk &amp; liquidations</Link>
              </li>
              <li>
                <a href="/api/docs" target="_blank" rel="noreferrer">
                  API reference
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Company</h3>
            <ul>
              <li>
                <Link to="/docs#about">About DEX</Link>
              </li>
              <li>
                <a href="/api/health" target="_blank" rel="noreferrer">
                  System status
                </a>
              </li>
              <li>
                <Link to="/docs#security">Security</Link>
              </li>
              <li>
                <Link to="/docs#contact">Contact</Link>
              </li>
            </ul>
          </div>
          <div>
            <h3>Legal</h3>
            <ul>
              <li>
                <Link to="/docs#terms">Terms of use</Link>
              </li>
              <li>
                <Link to="/docs#privacy">Privacy</Link>
              </li>
              <li>
                <Link to="/docs#risk">Risk disclosure</Link>
              </li>
              <li>
                <Link to="/docs#compliance">Compliance</Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mkt-site-footer-bottom">
        <p className="mkt-site-footer-disclaimer">
          Trading digital assets involves substantial risk of loss and is not suitable for every investor.
          Past performance is not indicative of future results. Review our risk disclosure before trading.
        </p>
        <div className="mkt-site-footer-meta">
          <span>© {year} DEX Markets Inc.</span>
          <span>USDC-settled · 24/7 markets</span>
        </div>
      </div>
    </footer>
  );
}
