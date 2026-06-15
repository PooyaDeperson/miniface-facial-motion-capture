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

export default function PrivacyPage() {
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
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-meta">
            Effective date: {EFFECTIVE_DATE} &nbsp;&middot;&nbsp; {DOMAIN}
          </p>
        </header>

        {/* Intro */}
        <section className="legal-section">
          <p className="legal-body">
            Your privacy matters. This policy explains what personal data{" "}
            <strong>{DOMAIN}</strong> collects, why we collect it, how we
            protect it, and what rights you have. We are committed to
            transparency and to processing your data lawfully under the GDPR.
          </p>
        </section>

        {/* Data controller */}
        <section className="legal-section">
          <h2 className="legal-heading">1. Who is responsible for your data?</h2>
          <p className="legal-body">
            The data controller for {DOMAIN} is:
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

        {/* What we collect */}
        <section className="legal-section">
          <h2 className="legal-heading">2. What data we collect</h2>
          <p className="legal-body">
            We collect only what is necessary to provide the service:
          </p>

          <div className="legal-table-wrapper">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Source</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Email address</td>
                  <td>Google OAuth (when you sign in)</td>
                  <td>
                    Identify your account, send product updates &amp; important
                    communications (see section 4).
                  </td>
                </tr>
                <tr>
                  <td>Display name &amp; profile photo</td>
                  <td>Google OAuth (public profile)</td>
                  <td>Show your name inside the app.</td>
                </tr>
                <tr>
                  <td>Google account ID (sub)</td>
                  <td>Google OAuth</td>
                  <td>Link your Google identity to your account securely.</td>
                </tr>
                <tr>
                  <td>Usage analytics</td>
                  <td>Google Analytics 4 (anonymised)</td>
                  <td>
                    Understand aggregate usage patterns to improve the app. No
                    personal data is shared with Google for advertising.
                  </td>
                </tr>
                <tr>
                  <td>Camera feed</td>
                  <td>Your device (browser MediaStream API)</td>
                  <td>
                    Real-time facial motion capture. The video stream is
                    processed entirely on your device — it is never uploaded,
                    transmitted, or stored on our servers.
                  </td>
                </tr>
                <tr>
                  <td>Motion capture data (recordings)</td>
                  <td>Generated in-app by you</td>
                  <td>
                    Stored in Supabase if you choose to save a recording. Only
                    accessible to your account.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="legal-body" style={{ marginTop: "16px" }}>
            We do <strong>not</strong> collect: payment information, precise
            location, device contacts, biometric identifiers, or any sensitive
            special-category data under Article 9 GDPR.
          </p>
        </section>

        {/* Legal basis */}
        <section className="legal-section">
          <h2 className="legal-heading">3. Legal basis for processing</h2>
          <ul className="legal-list">
            <li>
              <strong>Contract performance (Art. 6(1)(b) GDPR)</strong> — We
              process your email and identity data to create and maintain your
              account and deliver the service you signed up for.
            </li>
            <li>
              <strong>Legitimate interest (Art. 6(1)(f) GDPR)</strong> — We
              use analytics to improve performance and security of the service.
              Our interest does not override your rights.
            </li>
            <li>
              <strong>Consent (Art. 6(1)(a) GDPR)</strong> — For marketing and
              product update emails, we rely on your consent given at sign-up
              or opt-in. You can withdraw consent at any time.
            </li>
          </ul>
        </section>

        {/* Email communications */}
        <section className="legal-section">
          <h2 className="legal-heading">4. Email communications</h2>
          <p className="legal-body">
            When you create an account, we may send you:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Transactional emails</strong> — account-related
              notifications such as sign-in confirmations or important service
              updates. These are essential and cannot be opted out of while you
              hold an account.
            </li>
            <li>
              <strong>Product updates &amp; news</strong> — information about
              new features, improvements, and relevant updates to{" "}
              {DOMAIN}. You can opt out of these at any time by clicking
              &ldquo;Unsubscribe&rdquo; in any email or by contacting us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
                {CONTACT_EMAIL}
              </a>
              .
            </li>
          </ul>
          <p className="legal-body">
            We will never share your email with third parties for their own
            marketing purposes.
          </p>
        </section>

        {/* How we share data */}
        <section className="legal-section">
          <h2 className="legal-heading">5. How we share your data</h2>
          <p className="legal-body">
            We share your data only with the sub-processors necessary to run
            the service:
          </p>
          <div className="legal-third-party-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">Supabase</h3>
              <p className="legal-body">
                Hosts our database and authentication layer. Your account data
                and any saved recordings are stored here. Supabase is GDPR
                compliant, SOC 2 Type 2 certified, and offers Data Processing
                Agreements.
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
              <h3 className="legal-card-title">Google (Auth &amp; Analytics)</h3>
              <p className="legal-body">
                Google OAuth is used for sign-in. Google Analytics 4 is used
                for anonymised usage stats. Google processes data under its own
                privacy policy and applicable EU SCCs.
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
              <h3 className="legal-card-title">Vercel</h3>
              <p className="legal-body">
                The app is hosted on Vercel&apos;s infrastructure. Vercel
                processes request logs and may store IP addresses transiently
                for security and routing purposes.
              </p>
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Vercel Privacy Policy &rarr;
              </a>
            </div>
          </div>
          <p className="legal-body" style={{ marginTop: "16px" }}>
            We do not sell, rent, or trade your personal data with anyone.
          </p>
        </section>

        {/* Camera and facial data */}
        <section className="legal-section">
          <h2 className="legal-heading">6. Camera access &amp; facial data</h2>
          <p className="legal-body">
            {DOMAIN} is a real-time facial motion capture tool. Here is
            exactly how your camera data is handled:
          </p>
          <ul className="legal-list">
            <li>
              Your browser will ask for camera permission before anything
              starts. You are in full control.
            </li>
            <li>
              The video stream is processed <strong>entirely on your device</strong>{" "}
              using MediaPipe&apos;s face landmarker model running in WebAssembly.
              Nothing is sent to our servers.
            </li>
            <li>
              Facial landmark coordinates are used only to animate the 3D
              avatar in real time. They are not stored, analysed, or shared.
            </li>
            <li>
              If you export a motion capture recording, that data stays on your
              device until you explicitly save it to your account. Even then,
              we store the numerical motion data — not a video recording of
              your face.
            </li>
          </ul>
        </section>

        {/* Data retention */}
        <section className="legal-section">
          <h2 className="legal-heading">7. How long we keep your data</h2>
          <ul className="legal-list">
            <li>
              <strong>Account data</strong> — Retained for as long as your
              account is active. If you delete your account, all associated
              data is deleted within 30 days.
            </li>
            <li>
              <strong>Analytics data</strong> — Google Analytics data is
              retained for 14 months (the minimum configurable period in GA4).
            </li>
            <li>
              <strong>Email logs</strong> — Transactional email delivery logs
              are retained for 90 days for debugging purposes.
            </li>
          </ul>
        </section>

        {/* Your rights */}
        <section className="legal-section">
          <h2 className="legal-heading">8. Your rights under GDPR</h2>
          <p className="legal-body">
            If you are in the EU / EEA, you have the following rights:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Right of access</strong> — Request a copy of the personal
              data we hold about you.
            </li>
            <li>
              <strong>Right to rectification</strong> — Ask us to correct
              inaccurate or incomplete data.
            </li>
            <li>
              <strong>Right to erasure</strong> (&ldquo;right to be
              forgotten&rdquo;) — Ask us to delete your account and all
              associated data.
            </li>
            <li>
              <strong>Right to restrict processing</strong> — Ask us to
              temporarily stop processing your data in certain circumstances.
            </li>
            <li>
              <strong>Right to data portability</strong> — Request your data in
              a structured, machine-readable format.
            </li>
            <li>
              <strong>Right to object</strong> — Object to processing based on
              legitimate interest (e.g. analytics).
            </li>
            <li>
              <strong>Right to withdraw consent</strong> — Withdraw consent for
              marketing emails or analytics at any time without affecting the
              lawfulness of processing before withdrawal.
            </li>
          </ul>
          <p className="legal-body">
            To exercise any of these rights, email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
              {CONTACT_EMAIL}
            </a>
            . We will respond within 30 days. You also have the right to lodge
            a complaint with the Italian data protection authority,{" "}
            <a
              href="https://www.garanteprivacy.it"
              target="_blank"
              rel="noopener noreferrer"
              className="legal-link"
            >
              Garante per la Protezione dei Dati Personali
            </a>
            .
          </p>
        </section>

        {/* Security */}
        <section className="legal-section">
          <h2 className="legal-heading">9. Security</h2>
          <p className="legal-body">
            We take reasonable technical and organisational measures to protect
            your data, including:
          </p>
          <ul className="legal-list">
            <li>HTTPS encryption for all data in transit.</li>
            <li>
              Authentication handled by Supabase with industry-standard JWT
              tokens.
            </li>
            <li>
              Row-level security on our database so each user can only access
              their own data.
            </li>
            <li>No passwords stored — sign-in is handled by Google OAuth.</li>
          </ul>
          <p className="legal-body">
            No system is 100% secure. If you discover a security vulnerability,
            please disclose it responsibly to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        {/* International transfers */}
        <section className="legal-section">
          <h2 className="legal-heading">10. International data transfers</h2>
          <p className="legal-body">
            Our primary sub-processors (Supabase, Google, Vercel) may process
            data outside the European Economic Area. Where this occurs, we rely
            on appropriate safeguards such as the EU Standard Contractual
            Clauses (SCCs) and adequacy decisions by the European Commission.
          </p>
        </section>

        {/* Children */}
        <section className="legal-section">
          <h2 className="legal-heading">11. Children&apos;s privacy</h2>
          <p className="legal-body">
            This service is not directed at children under 16. We do not
            knowingly collect personal data from children under 16. If you
            believe a child has provided us with personal data, please contact
            us so we can delete it.
          </p>
        </section>

        {/* Changes */}
        <section className="legal-section">
          <h2 className="legal-heading">12. Changes to this policy</h2>
          <p className="legal-body">
            We may update this Privacy Policy from time to time. When we make
            material changes, we will update the effective date and notify
            signed-in users by email. Continued use of the service after a
            policy update constitutes acceptance of the new terms.
          </p>
        </section>

        {/* Contact */}
        <section className="legal-section">
          <h2 className="legal-heading">13. Contact us</h2>
          <p className="legal-body">
            Questions, requests, or complaints about this Privacy Policy?
            Reach out:
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
            <a href="/terms" className="legal-link">Terms of Service</a>
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
