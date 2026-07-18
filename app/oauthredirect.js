// app/oauthredirect.js
// Catches Google/Apple OAuth redirects like:
// imrcsetupmanager://oauthredirect?state=...
// Prevents Expo Router from showing "Unmatched Route".

import { Redirect } from "expo-router";

export default function OAuthRedirect() {
  return <Redirect href="/" />;
}
