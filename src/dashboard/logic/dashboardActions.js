// src/dashboard/logic/dashboardActions.js
export function openRoute(router, route) {
  if (!router || !route) return;
  router.push(route);
}

export function replaceRoute(router, route) {
  if (!router || !route) return;
  router.replace(route);
}
