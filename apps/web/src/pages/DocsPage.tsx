import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting started',
    blurb: 'Connect, fund, and place your first order.',
    tag: 'Start',
  },
  {
    id: 'markets',
    title: 'Markets & products',
    blurb: 'Spot pairs, perpetuals, and how books stay live.',
    tag: 'Trade',
  },
  {
    id: 'fees',
    title: 'Fees & funding',
    blurb: 'Trading fees, maker/taker, and hourly funding.',
    tag: 'Pricing',
  },
  {
    id: 'risk',
    title: 'Risk & liquidations',
    blurb: 'Isolated margin, maintenance, insurance, ADL.',
    tag: 'Risk',
  },
  {
    id: 'security',
    title: 'Security',
    blurb: 'Wallet auth, sessions, and feed integrity.',
    tag: 'Trust',
  },
  {
    id: 'api',
    title: 'API & status',
    blurb: 'OpenAPI, health checks, and metrics.',
    tag: 'Dev',
  },
] as const;

const FAQ = [
  {
    q: 'Why is an order book empty?',
    a: 'If the upstream venue feed is stale, we suspend that market instead of displaying outdated depth.',
  },
  {
    q: 'How do I add buying power?',
    a: 'Open Trade → Balances → Get USDC to credit your account, then place orders.',
  },
  {
    q: 'Where do I manage positions?',
    a: 'Use the terminal bottom panel or the Portfolio page for equity, margin, and balances.',
  },
  {
    q: 'What is the trading fee?',
    a: 'A flat 2 bps (0.02%) on every fill — maker and taker, spot and perpetuals.',
  },
] as const;

export default function DocsPage() {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();

  const cats = useMemo(() => {
    if (needle === '') return CATEGORIES;
    return CATEGORIES.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) ||
        c.blurb.toLowerCase().includes(needle) ||
        c.tag.toLowerCase().includes(needle),
    );
  }, [needle]);

  const faqs = useMemo(() => {
    if (needle === '') return FAQ;
    return FAQ.filter(
      (f) => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle),
    );
  }, [needle]);

  return (
    <div className="mkt-page su">
      <section className="su-hero">
        <div className="su-hero-copy">
          <p className="mkt-kicker">Support</p>
          <h1>Help center</h1>
          <p>Guides for trading, fees, risk controls, security, and developer access.</p>
          <label className="su-search">
            <span className="dim">Search</span>
            <input
              type="search"
              placeholder="Search articles, fees, liquidations…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search help center"
            />
          </label>
        </div>
        <div className="su-hero-art" aria-hidden="true">
          <img src="/brand/support-hero.svg" alt="" />
        </div>
      </section>

      <section className="su-cats">
        {cats.map((c) => (
          <a key={c.id} href={`#${c.id}`} className="su-cat">
            <span className="su-cat-tag">{c.tag}</span>
            <strong>{c.title}</strong>
            <span className="dim">{c.blurb}</span>
          </a>
        ))}
        {cats.length === 0 && <p className="dim su-empty">No topics match your search.</p>}
      </section>

      <div className="su-body">
        <nav className="su-rail" aria-label="Help topics">
          {CATEGORIES.map((c) => (
            <a key={c.id} href={`#${c.id}`}>
              {c.title}
            </a>
          ))}
          <a href="#faq">FAQ</a>
          <a href="#legal">Legal</a>
          <Link to="/trade" className="su-rail-cta">
            Open terminal →
          </Link>
        </nav>

        <div className="su-content mkt-docs">
          <section id="getting-started">
            <h2>Getting started</h2>
            <ol className="mkt-docs-steps">
              <li>
                <strong>Connect your wallet</strong>
                <span>Authenticate with MetaMask or any injected browser wallet.</span>
              </li>
              <li>
                <strong>Fund your account</strong>
                <span>Credit USDC from Balances in the terminal to unlock buying power.</span>
              </li>
              <li>
                <strong>Trade</strong>
                <span>
                  Open the <Link to="/trade">terminal</Link>, pick a market, and submit limit or market
                  orders.
                </span>
              </li>
            </ol>
          </section>

          <section id="markets">
            <h2>Markets &amp; products</h2>
            <div className="su-split-cards">
              <article>
                <h3>Spot</h3>
                <p>USDC pairs with real-time order books sourced from leading venues.</p>
              </article>
              <article>
                <h3>Perpetuals</h3>
                <p>USDC-margined contracts with hourly funding, marks, and isolated margin.</p>
              </article>
            </div>
            <p>
              Browse the full universe on <Link to="/markets">Markets</Link> or search inside the
              terminal watchlist.
            </p>
          </section>

          <section id="fees">
            <h2>Fees &amp; funding</h2>
            <div className="su-fee-grid">
              <div>
                <span className="dim">Trading fee</span>
                <strong>2 bps</strong>
                <em>0.02% maker &amp; taker</em>
              </div>
              <div>
                <span className="dim">Settlement</span>
                <strong>USDC</strong>
                <em>Spot &amp; perps</em>
              </div>
              <div>
                <span className="dim">Funding</span>
                <strong>Hourly</strong>
                <em>Shown in terminal</em>
              </div>
            </div>
          </section>

          <section id="risk">
            <h2>Risk &amp; liquidations</h2>
            <p>
              Perpetual positions use isolated margin with tiered maintenance requirements. If equity
              falls below maintenance, the position is liquidated at the mark price. Residual shortfalls
              may be absorbed by the insurance fund and auto-deleveraging (ADL) before house clearing.
            </p>
            <p>
              Spot balances locked in open orders are unavailable until the order fills or is canceled.
            </p>
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li>Session access is established with a wallet signature — we never hold your private keys.</li>
              <li>Authed WebSocket channels deliver account updates; disconnecting ends the session.</li>
              <li>Feed-staleness protections take a book offline rather than serving frozen depth as live.</li>
            </ul>
          </section>

          <section id="api">
            <h2>API &amp; status</h2>
            <div className="su-api-row">
              <a className="su-api-card" href="/api/docs" target="_blank" rel="noreferrer">
                <strong>OpenAPI</strong>
                <span className="dim">Interactive REST docs</span>
              </a>
              <a className="su-api-card" href="/api/health" target="_blank" rel="noreferrer">
                <strong>Health</strong>
                <span className="dim">System status</span>
              </a>
              <a className="su-api-card" href="/api/metrics" target="_blank" rel="noreferrer">
                <strong>Metrics</strong>
                <span className="dim">Prometheus</span>
              </a>
            </div>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            <dl className="mkt-faq">
              {faqs.map((f) => (
                <div key={f.q}>
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
              {faqs.length === 0 && <dd className="dim">No FAQ matches your search.</dd>}
            </dl>
          </section>

          <section id="legal">
            <h2>Legal</h2>
            <div className="su-legal-grid">
              <article id="about">
                <h3>About DEX</h3>
                <p>
                  DEX Markets operates a USDC-settled exchange for spot and perpetual trading with live
                  venue data and an in-house matching engine.
                </p>
              </article>
              <article id="terms">
                <h3>Terms of use</h3>
                <p>
                  By accessing DEX you agree to trade at your own risk and comply with applicable law.
                </p>
              </article>
              <article id="privacy">
                <h3>Privacy</h3>
                <p>
                  We process wallet addresses and trading activity required to operate your account. We do
                  not sell personal data.
                </p>
              </article>
              <article id="compliance">
                <h3>Compliance</h3>
                <p>
                  Users are responsible for understanding local regulations related to digital-asset
                  trading.
                </p>
              </article>
              <article id="contact">
                <h3>Contact</h3>
                <p>
                  For trading support and partnerships, use your account channel or the API reference for
                  developer access.
                </p>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
