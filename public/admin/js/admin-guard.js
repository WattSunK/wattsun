// public/admin/js/admin-guard.js
(function () {
  try {
    const u = JSON.parse(localStorage.getItem("wattsunUser") || "null")?.user
           || JSON.parse(localStorage.getItem("ws_user") || "null");
    const isAdmin = !!u && (u.type === "Admin" || u.role === "Admin");
    if (!isAdmin) window.location.replace("./index.html");
  } catch {
    window.location.replace("./index.html");
  }
})();
