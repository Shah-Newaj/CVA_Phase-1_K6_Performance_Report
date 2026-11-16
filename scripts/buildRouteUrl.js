export function buildRouteUrl(path, baseUrl, routeBase = '') {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const cleanBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  const cleanRouteBase = normalizeRoutePath(routeBase);
  const cleanRoutePath = normalizeRoutePath(path);
  const routeBasePath = cleanRouteBase ? `/${cleanRouteBase}` : '';

  return `${cleanBaseUrl}${routeBasePath}${cleanRoutePath ? `/${cleanRoutePath}` : '/'}`;
}

export function normalizeRoutePath(path) {
  return String(path || '').replace(/^\/+|\/+$/g, '');
}

