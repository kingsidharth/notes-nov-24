interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

const AUTH_PATHS = ["/sign-in", "/sign-up"];

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** `/sign-in`, carrying the current page as an absolute same-origin `redirect_url` (Clerk's convention). */
export function signInPathFor(location: LocationLike) {
  const back = location.pathname + location.search + location.hash;
  if (back === "/" || isAuthPath(location.pathname)) return "/sign-in";
  const redirectUrl = new URL(back, window.location.origin).href;
  return `/sign-in?${new URLSearchParams({ redirect_url: redirectUrl })}`;
}

/**
 * Where a signed-in visitor of /sign-in or /sign-up belongs: the `redirect_url`
 * they arrived with when it's a same-origin app page, otherwise home.
 */
export function afterAuthPath(search: string) {
  const raw = new URLSearchParams(search).get("redirect_url");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || isAuthPath(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
