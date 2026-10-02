# Support ticket environment

Set these values before building and restarting production:

```env
# Backend
TURNSTILE_SECRET_KEY=your-cloudflare-turnstile-secret-key
TURNSTILE_EXPECTED_HOSTNAME=tallypadi.com
SUPPORT_TICKET_ADMIN_EMAIL=support@tallypadi.com

# Frontend (must be present when `npm run build` runs in `web`)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
```

For local development, Cloudflare's always-pass test pair is:

```env
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

SMTP is read from the existing Admin → Global Settings configuration. If
`SUPPORT_TICKET_ADMIN_EMAIL` is omitted, notifications go to the configured
SMTP sender address.
