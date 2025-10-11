# QA Smoke Checklist — WattSun

| Test | Expected Result |
|------|------------------|
| `/api/health` | `{ "success": true }` |
| `/api/login` with known user | returns success |
| `/api/signup` | creates new user successfully |
| `/api/orders` | lists sample orders |
| `/api/loyalty` endpoints | respond without error |
| `/admin` dashboard | loads correctly |
| `/thankyou.html` | displays payment confirmation |
| Logs | `/logs/qa/app.out` updates cleanly |
| Cloudflare | `https://qa.wattsun.co.ke/api/health` reachable |
