import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// script-src needs 'unsafe-inline': Next.js 16 + Turbopack injects several
// inline <script> tags per request for RSC streaming/hydration, whose content
// (and hash) differs per request, so a static hash allowlist can't survive a
// rebuild. The documented fix is a per-request nonce set in middleware, which
// Next.js is supposed to auto-apply to its own inline/chunk scripts -- tried
// that here and verified live in a browser: the framework's own chunk scripts
// still got blocked (no nonce attribute applied to them), so the app broke
// completely. Rather than ship a broken app chasing a Turbopack-specific gap,
// this accepts 'unsafe-inline' for scripts. It's a real reduction vs a nonce,
// but this app has zero dangerouslySetInnerHTML (checked) and React already
// escapes all rendered content by default, so the realistic exposure is low.
// Revisit if Next.js's nonce auto-propagation gets fixed for Turbopack, or if
// this app ever adds a user-content-rendering surface.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isProd ? [] : ["'unsafe-eval'"]),
  // hCaptcha widget script (sign-in / delete-confirmation forms).
  "https://*.hcaptcha.com",
];

const contentSecurityPolicy = [
  `default-src 'self'`,
  `script-src ${scriptSrc.join(" ")}`,
  // Inline style={{}} attributes are used throughout the app's components, so
  // style-src needs 'unsafe-inline' too. Can't execute JS, so much lower risk.
  // hCaptcha's widget also injects its own inline styles.
  `style-src 'self' 'unsafe-inline' https://*.hcaptcha.com`,
  // MFA QR codes are rendered as data: URIs (see getMfaQrCodeImageUrl), never
  // fetched from an external host.
  `img-src 'self' data:`,
  `font-src 'self'`,
  // The app talks directly to Supabase from the browser (no /api routes).
  // hCaptcha's script makes its own verification calls to hcaptcha.com.
  `connect-src 'self' https://*.supabase.co https://*.hcaptcha.com`,
  // No frame-src previously existed, so it fell back to default-src 'self',
  // which blocks the hCaptcha challenge iframe entirely.
  `frame-src 'self' https://*.hcaptcha.com`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Only meaningful over HTTPS, so keep it out of local http:// dev entirely.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
