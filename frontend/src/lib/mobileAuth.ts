import { Capacitor } from '@capacitor/core';

export const MOBILE_AUTH_SCHEME = 'com.mibilletepro.app';
export const MOBILE_AUTH_REDIRECT_URL = `${MOBILE_AUTH_SCHEME}://auth/callback`;

export const getAuthRedirectUrl = (purpose?: 'recovery') => {
  if (!Capacitor.isNativePlatform()) return `${window.location.origin}/`;
  if (!purpose) return MOBILE_AUTH_REDIRECT_URL;

  const redirect = new URL(MOBILE_AUTH_REDIRECT_URL);
  redirect.searchParams.set('type', purpose);
  return redirect.toString();
};
