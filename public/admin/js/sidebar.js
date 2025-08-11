// admin/js/sidebar.js (fixed)

function initSidebarUserInfo() {
  const raw = localStorage.getItem("wattsunUser");
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
    <strong>${user.name}</strong>
    <span>${user.email || ""}</span>
    <span style="color:#888;font-size:0.92em;">${user.type}</span>
  `;

  const adminLinks = document.querySelectorAll(".admin-only");
  adminLinks.forEach(link => {
    link.style.display = "block";
    console.log("🔍 Admin-only link:", link, "Visible:", link.style.display);
  });

  const logoutBtn = document.querySelector(".logout");
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("wattsunUser");
    window.location.href = "/index.html";
  });
}

// ✅ Listen for event triggered after sidebar injection
document.addEventListener("partialsLoaded", initSidebarUserInfo);