WattSun Solar - Backend Route Files (Optimized for Production)
--------------------------------------------------------------
* All route files are included EXCEPT 'items_debug.js' (debug-only, not for production).
* Your SMTP password in reset.js should NOT be committed in plaintext.
  - Instead, create a .env file in your backend root:
      SMTP_USER=your_email@example.com
      SMTP_PASS=your_app_password
  - Update reset.js to use process.env.SMTP_USER and process.env.SMTP_PASS

* All routes are safe to use as-is, but review for custom app needs.
