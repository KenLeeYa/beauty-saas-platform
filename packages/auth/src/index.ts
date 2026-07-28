export type GoogleIdentityClaims = {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  exp: number;
};

export type SessionCookieOptions = {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
};

export const sessionCookieOptions: SessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/"
};
