WattSun Patch - Compact System Status + Unified Table Styling
============================================================

Updated files in this patch:
- admin/admin.css                        (style-map so all partial tables match My Orders + status/card styles)
- public/partials/system-status.html     (status is now a compact card in the 3-column grid; better error handling)

Deploy
------
1) Copy 'admin/admin.css' to your server's /admin/admin.css (replace existing).
2) Copy 'public/partials/system-status.html' to /public/partials/system-status.html (replace existing).
3) Hard refresh the browser (Ctrl/Cmd+Shift+R).

Why status shows "Loading…" or "Disconnected"
---------------------------------------------
The new status script includes:
- timeouts (8s) so it won’t hang forever
- explicit network error messages

Check the endpoints directly from the server:
  curl -i http://localhost:3001/api/health
  curl -i http://localhost:3001/api/tunnel

Common causes:
- Wrong base path (e.g., app served under /wattsun but fetching /api/* from root)
- CORS blocked in the browser console
- Reverse proxy not forwarding /api/* to backend
- Mixed content (HTTP API behind HTTPS UI)
- Backend service down or bound to another port/IP

If your app lives at /wattsun, set a base prefix and update the fetches:
  fetch('/wattsun/api/health')
  fetch('/wattsun/api/tunnel')

You can change the two fetch calls inside system-status.html accordingly.