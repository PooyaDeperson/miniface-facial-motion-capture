/*
 * Copyright (c) 2025 Pooya Moradi M. arkitface@gmail.com
 * miniface.org
 */

import "../App.css";
import "./legal.css";

const EFFECTIVE_DATE = "June 15, 2026";
const DOMAIN = "miniface.org";
const OWNER_NAME = "Pooya Moradi M.";
const OWNER_CITY = "Rome, Italy";
const CONTACT_EMAIL = "arkitface@gmail.com";

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        {/* Back link */}
        <a href="/" className="legal-back" aria-label="Back to home page">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to home
        </a>

        {/* Header */}
        <header className="legal-header">
          <p className="legal-label">Legal</p>
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-meta">
            Effective date: {EFFECTIVE_DATE} &nbsp;&middot;&nbsp; {DOMAIN}
          </p>
        </header>

        {/* Intro */}
        <section className="legal-section">
          <p className="legal-body">
            Welcome to <strong>{DOMAIN}</strong> — a browser-based real-time
            facial motion capture tool. By accessing or using this service, you
            agree to these Terms of Service. Please read them carefully. If you
            do not agree, do not use the service.
          </p>
          <p className="legal-body">
            These terms are governed by Italian law and apply to all users of{" "}
            {DOMAIN}, regardless of location.
          </p>
        </section>

        {/* 1. What the service is */}
        <section className="legal-section">
          <h2 className="legal-heading">1. What this service provides</h2>
          <p className="legal-body">
            {DOMAIN} lets you capture and export real-time 3D motion data
            directly in your browser. The core capabilities include:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Facial motion capture</strong> — Your webcam feed is
              processed locally using MediaPipe&apos;s face landmarker model
              (running in WebAssembly). Facial landmark coordinates drive
              blendshape animations on a 3D avatar in real time.
            </li>
            <li>
              <strong>Head rotation tracking</strong> — Pitch, yaw, and roll
              of your head are captured via a 4&times;4 transformation matrix
              from MediaPipe and mapped to the avatar&apos;s Head, Neck, and
              Spine2 bones.
            </li>
            <li>
              <strong>Secondary / finger motion</strong> — A spring-physics
              secondary motion system drives additional bone chains (including
              finger joints) for natural follow-through motion beyond the
              primary facial capture.
            </li>
            <li>
              <strong>GLB export</strong> — Recorded sessions are exported as
              a self-contained binary GLTF (<code>.glb</code>) file embedding
              the full avatar mesh, skeleton, textures, and an{" "}
              <code>AnimationClip</code> containing all captured tracks
              (morph targets, bone quaternions). The file downloads directly to
              your device.
            </li>
            <li>
              <strong>Avatar customisation</strong> — Multiple Ready Player Me
              compatible avatars are available to choose from. Avatar and scene
              colour preferences can be adjusted within the app.
            </li>
            <li>
              <strong>Account &amp; cloud saves</strong> — Optional sign-in via
              Google OAuth allows you to save recordings to your account, stored
              in Supabase.
            </li>
          </ul>
        </section>

        {/* 2. Acceptance */}
        <section className="legal-section">
          <h2 className="legal-heading">2. Acceptance of terms</h2>
          <p className="legal-body">
            By using {DOMAIN}, you confirm that you:
          </p>
          <ul className="legal-list">
            <li>Are at least 16 years old (or have parental consent if younger).</li>
            <li>
              Have read, understood, and agree to be bound by these Terms of
              Service, our{" "}
              <a href="/privacy" className="legal-link">Privacy Policy</a>, and
              our{" "}
              <a href="/cookies" className="legal-link">Cookie Policy</a>.
            </li>
            <li>
              Are using the service for lawful purposes only and in accordance
              with these terms.
            </li>
          </ul>
        </section>

        {/* 3. Camera and data */}
        <section className="legal-section">
          <h2 className="legal-heading">3. Camera access &amp; on-device processing</h2>
          <p className="legal-body">
            The service requires access to your device camera. By granting
            camera permission:
          </p>
          <ul className="legal-list">
            <li>
              You acknowledge that your camera feed is processed{" "}
              <strong>entirely on your device</strong>. No video, image frames,
              or raw facial data are transmitted to our servers at any point.
            </li>
            <li>
              Facial landmark coordinates extracted by MediaPipe are used solely
              to animate the 3D avatar in your browser session and, if you
              choose to record, to generate numerical motion data for export.
            </li>
            <li>
              We do not store, analyse, sell, or share your biometric or facial
              data. Exported <code>.glb</code> files contain only numerical
              motion keyframes — not video or images of your face.
            </li>
            <li>
              You retain full control: you may revoke camera permission at any
              time through your browser settings.
            </li>
          </ul>
        </section>

        {/* 4. Recordings and exports */}
        <section className="legal-section">
          <h2 className="legal-heading">4. Recordings &amp; exported files</h2>
          <p className="legal-body">
            All motion capture recordings you create belong to you. Regarding
            exported <code>.glb</code> files:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Local exports</strong> — Files downloaded directly to
              your device are stored solely on your device and under your
              control. We have no access to them.
            </li>
            <li>
              <strong>Cloud saves</strong> — If you are signed in and choose to
              save a recording to your account, the motion data is stored in
              Supabase under your user ID and is accessible only to you.
            </li>
            <li>
              <strong>File format</strong> — Exported files are standard binary
              GLTF 2.0 (<code>.glb</code>) and are compatible with any
              GLTF-compliant 3D tool (Blender, Unity, Unreal Engine, etc.).
            </li>
            <li>
              You may use your exported recordings for any personal or
              commercial project. No royalties or attribution to {DOMAIN} is
              required for the captured animation data itself.
            </li>
            <li>
              The bundled avatar meshes in exported files are subject to their
              own third-party licenses (see Section 7).
            </li>
          </ul>
        </section>

        {/* 5. Acceptable use */}
        <section className="legal-section">
          <h2 className="legal-heading">5. Acceptable use</h2>
          <p className="legal-body">
            You agree not to use {DOMAIN} to:
          </p>
          <ul className="legal-list">
            <li>
              Violate any applicable law or regulation, including privacy laws
              relating to capturing the likeness or motion data of others
              without their consent.
            </li>
            <li>
              Attempt to reverse-engineer, scrape, or systematically extract
              data from the service beyond normal use.
            </li>
            <li>
              Interfere with or disrupt the integrity or performance of the
              service or its underlying infrastructure.
            </li>
            <li>
              Impersonate another person or misrepresent your affiliation with
              any person or entity.
            </li>
            <li>
              Capture, record, or export the motion data of another person
              without their informed and explicit consent.
            </li>
          </ul>
        </section>

        {/* 6. Accounts */}
        <section className="legal-section">
          <h2 className="legal-heading">6. Accounts &amp; authentication</h2>
          <p className="legal-body">
            Account creation is optional. The core capture and export
            functionality is available without signing in.
          </p>
          <ul className="legal-list">
            <li>
              Sign-in is handled via <strong>Google OAuth 2.0</strong>. We
              request only your public profile and email address. We do not
              access your Google Drive, Gmail, or any other Google service.
            </li>
            <li>
              Session management and account data are handled by{" "}
              <strong>Supabase</strong> using industry-standard JWT tokens and
              row-level security.
            </li>
            <li>
              You are responsible for maintaining the security of your Google
              account. We are not liable for any loss resulting from
              unauthorised access to your account.
            </li>
            <li>
              You may delete your account at any time by contacting us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
                {CONTACT_EMAIL}
              </a>
              . All associated data will be deleted within 30 days.
            </li>
          </ul>
        </section>

        {/* 7. Third-party services and licenses */}
        <section className="legal-section">
          <h2 className="legal-heading">7. Third-party services &amp; licenses</h2>
          <p className="legal-body">
            {DOMAIN} is built on and integrates with the following third-party
            services and open-source technologies:
          </p>
          <div className="legal-third-party-grid">
            <div className="legal-card">
              <h3 className="legal-card-title">MediaPipe</h3>
              <p className="legal-body">
                Google&apos;s MediaPipe Tasks Vision library (Apache 2.0) runs
                in WebAssembly on your device for real-time facial landmark
                detection. The WASM binaries ship with the app and process data
                entirely locally — no data leaves your browser.
              </p>
              <a
                href="https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                MediaPipe documentation &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Three.js &amp; React Three Fiber</h3>
              <p className="legal-body">
                3D rendering is powered by Three.js (MIT License) and React
                Three Fiber. The{" "}
                <code>GLTFExporter</code> from Three.js builds the exported{" "}
                <code>.glb</code> file, embedding the avatar scene,
                skeleton, textures, and the captured <code>AnimationClip</code>.
              </p>
              <a
                href="https://threejs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Three.js license &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Supabase</h3>
              <p className="legal-body">
                Authentication and optional cloud storage are provided by
                Supabase. Your account data and saved recordings are stored in
                Supabase&apos;s infrastructure. Supabase is SOC 2 Type 2
                certified and GDPR-ready.
              </p>
              <a
                href="https://supabase.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Supabase Terms &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Vercel</h3>
              <p className="legal-body">
                The application is hosted and served via Vercel&apos;s global
                edge network. Vercel processes request metadata (IP addresses,
                user agents) transiently for routing and security purposes.
              </p>
              <a
                href="https://vercel.com/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Vercel Terms &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Ready Player Me Avatars</h3>
              <p className="legal-body">
                The bundled avatar <code>.glb</code> files are based on the
                Ready Player Me avatar format. These assets may be subject to
                Ready Player Me&apos;s own terms of use when redistributed as
                part of an exported file.
              </p>
              <a
                href="https://readyplayer.me/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Ready Player Me Terms &rarr;
              </a>
            </div>
            <div className="legal-card">
              <h3 className="legal-card-title">Google OAuth &amp; Analytics</h3>
              <p className="legal-body">
                Sign-in uses Google OAuth 2.0. Anonymous usage analytics are
                collected via Google Analytics 4 with IP anonymisation enabled.
                Data is processed by Google LLC under EU Standard Contractual
                Clauses.
              </p>
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Google Terms &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* 8. Intellectual property */}
        <section className="legal-section">
          <h2 className="legal-heading">8. Intellectual property</h2>
          <p className="legal-body">
            The source code of {DOMAIN} is released under the MIT License with
            Attribution — see the repository for the full license text. This
            grants you the right to use, copy, modify, merge, publish, and
            distribute the code, provided that the original attribution to{" "}
            {OWNER_NAME} is preserved.
          </p>
          <ul className="legal-list">
            <li>
              The {DOMAIN} name, logo, and associated branding remain the
              property of {OWNER_NAME} and may not be used without written
              permission.
            </li>
            <li>
              Motion capture data you generate belongs entirely to you. We
              claim no ownership over recordings you create with the service.
            </li>
            <li>
              Third-party assets (MediaPipe models, Three.js, avatar meshes)
              are subject to their respective open-source or commercial
              licenses as listed in Section 7.
            </li>
          </ul>
        </section>

        {/* 9. Disclaimer of warranties */}
        <section className="legal-section">
          <h2 className="legal-heading">9. Disclaimer of warranties</h2>
          <p className="legal-body">
            {DOMAIN} is provided <strong>&ldquo;as is&rdquo;</strong> and{" "}
            <strong>&ldquo;as available&rdquo;</strong> without warranties of
            any kind, either express or implied. We do not warrant that:
          </p>
          <ul className="legal-list">
            <li>
              The service will be uninterrupted, error-free, or free of
              viruses or other harmful components.
            </li>
            <li>
              The motion capture output will meet your specific accuracy or
              professional requirements.
            </li>
            <li>
              Any defects in the service will be corrected in a timely manner.
            </li>
          </ul>
          <p className="legal-body">
            Use of the service is at your own risk. Some jurisdictions do not
            allow the exclusion of implied warranties, so the above exclusion
            may not apply to you.
          </p>
        </section>

        {/* 10. Limitation of liability */}
        <section className="legal-section">
          <h2 className="legal-heading">10. Limitation of liability</h2>
          <p className="legal-body">
            To the fullest extent permitted by applicable law, {OWNER_NAME}{" "}
            shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising out of or related to
            your use of or inability to use the service, including but not
            limited to loss of data, lost profits, or business interruption.
          </p>
          <p className="legal-body">
            Our total liability for any claim arising from these terms or your
            use of the service shall not exceed &euro;100 (one hundred euros)
            or the amount you paid us in the preceding 12 months, whichever is
            greater. As {DOMAIN} is currently free of charge, this effectively
            limits liability to &euro;100.
          </p>
        </section>

        {/* 11. Indemnification */}
        <section className="legal-section">
          <h2 className="legal-heading">11. Indemnification</h2>
          <p className="legal-body">
            You agree to indemnify and hold harmless {OWNER_NAME} from and
            against any claims, damages, losses, and expenses (including
            reasonable legal fees) arising from: (a) your use of the service
            in violation of these terms; (b) your violation of any applicable
            law or regulation; or (c) your infringement of any third-party
            rights.
          </p>
        </section>

        {/* 12. Changes */}
        <section className="legal-section">
          <h2 className="legal-heading">12. Changes to these terms</h2>
          <p className="legal-body">
            We may update these Terms of Service from time to time. When we
            make material changes, we will update the effective date at the top
            of this page and notify signed-in users by email. Continued use of
            the service after an update constitutes your acceptance of the
            revised terms.
          </p>
        </section>

        {/* 13. Governing law */}
        <section className="legal-section">
          <h2 className="legal-heading">13. Governing law &amp; disputes</h2>
          <p className="legal-body">
            These terms are governed by the laws of Italy, without regard to
            conflict of law principles. Any dispute arising from or relating to
            these terms or the service shall be subject to the exclusive
            jurisdiction of the courts of Rome, Italy.
          </p>
          <p className="legal-body">
            If you are a consumer in the EU, you also have the right to use the
            EU Online Dispute Resolution platform at{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="legal-link"
            >
              ec.europa.eu/consumers/odr
            </a>
            .
          </p>
        </section>

        {/* 14. Contact */}
        <section className="legal-section">
          <h2 className="legal-heading">14. Contact us</h2>
          <p className="legal-body">
            Questions or concerns about these Terms of Service? Get in touch:
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
            <a href="/" className="legal-link">Back to home</a>
          </p>
          <p style={{ marginTop: "8px" }}>
            &copy; {new Date().getFullYear()} {OWNER_NAME} &mdash; {DOMAIN}
          </p>
        </footer>
      </div>
    </div>
  );
}
