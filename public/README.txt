
WattSun Dashboard – Modular Admin Panel Setup
==============================================

This package contains the modular admin dashboard for WattSun Solar.

STRUCTURE:
----------

Place the following structure under:

    /volume1/web/wattsun/public/

Resulting structure:

public/
├── dashboard.html              <-- Main dashboard shell (uses admin.css)
├── js/
│   └── dashboard.js            <-- Handles tab loading
└── partials/                   <-- HTML fragments loaded dynamically
    ├── orders.html
    ├── items.html
    ├── myorders.html
    ├── settings.html
    └── system-status.html

NOTE:
-----
- Styling is loaded ONLY from: /admin/admin.css
- Do NOT add <html>, <head>, or <body> to partials
- `dashboard.html` uses JavaScript to load these fragments into a container

USAGE:
------
1. Access the admin panel via: http://<your-ip>:<port>/dashboard.html
2. Tabs will dynamically fetch corresponding partials from /partials/
3. To edit styles, modify `/admin/admin.css`
4. To create a new tab, add a new .html file in partials/, then update dashboard.html

