# Google OAuth

## Environment ownership

- Google Cloud project: `beauty-saas-identity-ky`
- Production OAuth client: `Beauty SaaS Production`
- Local OAuth client: `Beauty SaaS Local Development`
- OAuth audience: External, in production
- Hosted Auth: Beauty's independent Supabase project
- Application callback: `/auth/callback`

Google client secrets belong in Google Cloud and Supabase Auth configuration.
They must not be added to Vercel, source files, logs, or GitHub.

## Production URLs

- Application origin: `https://beauty-saas-platform-roan.vercel.app`
- Application callback:
  `https://beauty-saas-platform-roan.vercel.app/auth/callback`
- Google authorized redirect:
  `https://dfuhylsmhrysbmhpeylx.supabase.co/auth/v1/callback`

Supabase Auth must use the application origin as its Site URL and allow the
application callback. Vercel only needs
`NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED=true`; Google credentials remain in Supabase.

## Local URLs

- Application origins: `http://127.0.0.1:3100` and
  `http://localhost:3100`
- Google authorized redirect:
  `http://127.0.0.1:55321/auth/v1/callback`
- Application callback: `http://127.0.0.1:3100/auth/callback`

Store the local client in the ignored `.env.oauth.local` file:

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=replace-with-local-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=replace-with-local-client-secret
```

Restart the local Supabase stack after changing either value so the Auth
container receives the new credentials.

## Verification

1. Confirm `/auth/google` redirects to the Beauty Supabase
   `/auth/v1/authorize` endpoint.
2. Confirm Supabase redirects to `accounts.google.com`.
3. Complete one Google sign-in and verify the application callback creates an
   application session.
4. Verify a new user reaches the public booking page, while an existing member
   reaches the destination derived from server-side membership data.
5. Run `npm run production:smoke -- <production-url>` after every credential or
   redirect change.

## Rotation

Create a replacement Google client secret, update Supabase Auth, verify the
redirect chain, and only then revoke the old secret. For local rotation, update
`.env.oauth.local` and recreate the local Supabase Auth container.
