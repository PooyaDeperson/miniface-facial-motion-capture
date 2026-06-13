/*
 * Copyright (c) 2025 Pooya Moradi M. arkitface@gmail.com
 * facemocap.radframes.com
 */

import "../App.css";
import "./legal.css";

const EFFECTIVE_DATE = "June 13, 2026";
const DOMAIN = "facemocap.radframes.com";
const OWNER_NAME = "Pooya Moradi M.";
const OWNER_CITY = "Rome, Italy";
const CONTACT_EMAIL = "arkitface@gmail.com";
const GA_ID = "G-YTRBDF94V3";

export default function CookiesPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        {/* Back link */}
        <a href="/" className="legal-back" aria-label="Back to app">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to app
        </a>

        {/* Header */}
        <header className="legal-header">
          <p className="legal-label">Legal</p>
          <h1 className="legal-title">Cookie Policy</h1>
          <p className="legal-meta">
            Effective date: {EFFECTIVE_DATE} &nbsp;&middot;&nbsp; {DOMAIN}
          </p>
        </header>

        {/* Intro */}
        <section className="legal-section">
          <p className="legal-body">
            Hey! This page explains what cookies and similar technologies{" "}
            <strong>{DOMAIN}</strong> uses, why we use them, and what you can
            do about it. We keep things simple — no tracking walls, no dark
            patterns.
          </p>
        </section>

        {/* What are cookies */}
        <section className="legal-section">
          <h2 className="legal-heading">What are cookies?</h2>
          <p className="legal-body">
            Cookies are small text files placed on your device when you visit a
            website. They help sites remember preferences, keep you signed in,
            and understand how people use the service so it can be improved.
          </p>
        </section>

        {/* Cookies we use */}
        <section className="legal-section">
          <h2 className="legal-heading">Cookies we use</h2>
          <p className="legal-body">
            We use a minimal set of cookies grouped into three categories:
          </p>

          <div className="legal-table-wrapper">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Cookie / Service</th>
                  <th>Purpose</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="legal-badge legal-badge--essential">Essential</span>
                  </td>
                  <td>Supabase auth token<br /><code>sb-access-token</code>, <code>sb-refresh-token</code></td>
                  <td>
                    Keeps you signed in across page visits. Set only when you
                    choose to log in with Google OAuth.
                  </td>
                  <td>Session / up to 1 year (refresh)</td>
                </tr>
                <tr>
                  <td>
                    <span className="legal-badge legal-badge--analytics">Analytics</span>
                  </td>
                  <td>Google Analytics 4<br /><code>_ga</code>, <code>_ga_{GA_ID}</code></td>
                  <td>
                    Helps us understand how people use the app — which features
                    are popular, rough geographic region, device type. No
                    personal data is sold or shared.
                  </td>
                  <td>2 years</td>
                </tr>
                <tr>
                  <td>
                    <span className="legal-badge legal-badge--analytics">Analytics</span>
                  </td>
                  <td>Google Analytics<br /><code>_gid</code></td>
                  <td>Distinguishes unique users within a 24-hour window.</td>
                  <td>24 hours</td>
                </tr>
                <tr>
                  <td>
                    <span className="legal-badge legal-badge--analytics">Analytics</span>
                  </td>
                  <td>Google Analytics<br /><code>_gat</code></td>
                  <td>Throttles request rate to Google Analytics servers.</td>
                  <td>1 minute</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="legal-body" style={{ marginTop: "16px" }}>
            We do <strong>not</strong> use advertising cookies, retargeting
            cookies, or any third-party tracking pixels beyond Google Analytics.
          </p>
        </section>

        {/* Why we use them */}
        <section className="legal-section">
          <h2 className="legal-heading">Why we use them</h2>
          <ul className="legal-list">
            <li>
              <strong>Essential cookies</strong> — These are strictly necessary
              to provide the service. Without them, features like saving your
              motion captures to your account simply would not work.
            </li>
            <li>
              <strong>Analytics cookies</strong> — These help us improve the
              app. We use aggregate, anonymised data to understand what works
              well and what needs fixing. We have configured Google Analytics to
              anonymise IP addresses.
            </li>
          </ul>
        </section>

        {/* Legal basis */}
        <section className="legal-section">
          <h2 className="legal-heading">Legal basis (GDPR &amp; ePrivacy)</h2>
          <p className="legal-body">
            We are based in Italy, which means EU law applies to us. Under the
            GDPR and the ePrivacy Directive:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Essential cookies</strong> are placed on the basis of
              <em> legitimate interest</em> and <em>contract performance</em> —
              they are required for you to use the service you requested.
            </li>
            <li>
              <strong>Analytics cookies</strong> are placed on the basis of your{" "}
              <em>consent</em>. By continuing to use the site after being
              informed (e.g. through our cookie notice), you consent to their
              placement. You can withdraw consent at any time (see below).
            </li>
          </ul>
        </section>

        {/* Your choices */}
        <section className="legal-section">
          <h2 className="legal-heading">Your choices &amp; opt-out</h2>
          <p className="legal-body">
            You are always in control. Here is how to manage cookies:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Browser settings</strong> — All modern browsers let you
              view, block, or delete cookies. Check your browser&apos;s help
              section for instructions. Note that blocking essential cookies
              will prevent you from staying signed in.
            </li>
            <li>
              <strong>Google Analytics opt-out</strong> — Install the official{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Google Analytics Opt-out Browser Add-on
              </a>{" "}
              to stop Google Analytics across all sites.
            </li>
            <li>
              <strong>Google&apos;s privacy controls</strong> — Visit{" "}
              <a
                href="https://myaccount.google.com/data-and-privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Google&apos;s Data &amp; Privacy settings
              </a>{" "}
              to manage how your data is used.
            </li>
          </ul>
        </section>

        {/* Third-party services */}
        <section className="legal-section">
          <h2 className="legal-heading">Third-party services</h2>
          <div className="legal-third-party-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Google Analytics</h3>
              <p className="legal-body">
                We use Google Analytics 4 (GA4) to understand aggregate usage
                patterns. Data is processed by Google LLC. IP anonymisation is
                enabled. Google may transfer data outside the EU under Standard
                Contractual Clauses.
              </p>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Google Privacy Policy &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Supabase</h3>
              <p className="legal-body">
                Authentication is handled by Supabase, which stores session
                tokens securely in your browser. Supabase is SOC 2 compliant
                and GDPR-ready with data processing agreements available.
              </p>
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Supabase Privacy Policy &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Google OAuth</h3>
              <p className="legal-body">
                When you sign in we use Google OAuth 2.0. We only request your
                public profile and email address. We do not access your Google
                Drive, Gmail, or any other Google service.
              </p>
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Google Terms of Service &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* Changes */}
        <section className="legal-section">
          <h2 className="legal-heading">Changes to this policy</h2>
          <p className="legal-body">
            We may update this Cookie Policy from time to time. When we do, we
            will update the effective date at the top of this page. For
            significant changes we will notify signed-in users by email. We
            encourage you to review this page occasionally.
          </p>
        </section>

        {/* Contact */}
        <section className="legal-section">
          <h2 className="legal-heading">Questions?</h2>
          <p className="legal-body">
            Got questions about our cookie practices? Reach out — we are happy
            to help.
          </p>
          <div className="legal-contact-card">
            <p className="legal-body">
              <strong>{OWNER_NAME}</strong><br />
              {OWNER_CITY}<br />
              <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="legal-footer">
          <p>
            <a href="/privacy" className="legal-link">Privacy Policy</a>
            &nbsp;&middot;&nbsp;
            <a href="/cookies" className="legal-link">Cookie Policy</a>
            &nbsp;&middot;&nbsp;
            <a href="/" className="legal-link">Back to app</a>
          </p>
          <p style={{ marginTop: "8px" }}>
            &copy; {new Date().getFullYear()} {OWNER_NAME} &mdash; {DOMAIN}
          </p>
        </footer>
      </div>
    </div>
  );
}
