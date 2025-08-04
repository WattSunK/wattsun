// admin/js/sidebar.js

window.addEventListener("DOMContentLoaded", () => {
  const raw = localStorage.getItem("wattsun_user");
  console.log("✅ RAW localStorage:", raw);

  let user = null;

  try {
    const parsed = raw ? JSON.parse(raw) : null;
    console.log("✅ Parsed:", parsed);

    user = parsed?.user ?? null;
    console.log("✅ User:", user);
  } catch (err) {
    console.error("❌ Failed to parse wattsun_user:", err);
  }

  const userInfoContainer = document.getElementById("sidebar-user-info");

  if (!user || !userInfoContainer) {
    console.warn("⚠️ User missing or container missing");
    if (userInfoContainer) {
      userInfoContainer.innerHTML = "<span class='text-danger'>No user info</span>";
    }
    return;
  }

  userInfoContainer.innerHTML = `
    <i class="fas fa-user"></i> ${user.name || "Unknown"} (${user.type || "Unknown"})
  `;

  // Show/hide admin-only links
  const adminLinks = document.querySelectorAll(".admin-only");
  adminLinks.forEach(link => {
    link.style.display = user.type === "Admin" ? "block" : "none";
    console.log("🔍 Admin-only link:", link, "Visible:", link.style.display);
  });

  // Logout button
  const logoutBtn = document.querySelector(".logout");
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("wattsun_user");
    window.location.href = "/index.html";
  });
});
