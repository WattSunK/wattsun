// admin/js/sidebar.js

window.addEventListener("DOMContentLoaded", () => {
  const userData = localStorage.getItem("wattsun_user");
  const user = userData ? JSON.parse(userData).user : null;

  const userInfoContainer = document.getElementById("sidebar-user-info");

  if (!user || !userInfoContainer) {
    if (userInfoContainer) {
      userInfoContainer.innerHTML = "<span class='text-danger'>No user info</span>";
    }
    return;
  }

  // Insert user name and role into sidebar
  userInfoContainer.innerHTML = `
    <i class="fas fa-user"></i> ${user.name || "Unknown"} (${user.type || "Unknown"})
  `;

  // Show/hide admin-only links
  const adminLinks = document.querySelectorAll(".admin-only");
  adminLinks.forEach(link => {
    link.style.display = user.type === "Admin" ? "block" : "none";
  });

  // Logout button
  const logoutBtn = document.querySelector(".logout");
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("wattsun_user");
    window.location.href = "/index.html";
  });
});
