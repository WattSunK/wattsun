// admin/js/sidebar.js

window.addEventListener("DOMContentLoaded", () => {
  const userData = localStorage.getItem("wattsun_user");
  const sidebar = document.getElementById("sidebar-container");
  const header = document.getElementById("header-container");

  if (!userData) {
    sidebar.innerHTML = "<p class='error'>Not logged in</p>";
    return;
  }

  const user = JSON.parse(userData);

  // Sidebar HTML
  sidebar.innerHTML = `
    <div class="sidebar">
      <h2>Admin</h2>
      <p class="user-info">${user.name || "undefined"} (${user.type || "undefined"})</p>
      <ul class="sidebar-nav">
        <li><a href="#dashboard">Dashboard</a></li>
        <li><a href="#myaccount">My Account</a></li>
        <li><a href="#orders">Orders</a></li>
        <li><a href="#logout" id="logout-link">Log Out</a></li>
      </ul>
    </div>
  `;

  // Optional: Header user profile (if header exists)
  if (header) {
    header.innerHTML = `
      <div class="admin-header-profile">
        <span><i class="fas fa-user"></i> ${user.name || "undefined"} (${user.type || "undefined"})</span>
        <button id="logout-btn">Logout</button>
      </div>
    `;
  }

  // Log out button
  document.getElementById("logout-link")?.addEventListener("click", () => {
    localStorage.removeItem("wattsun_user");
    window.location.href = "/index.html";
  });
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    localStorage.removeItem("wattsun_user");
    window.location.href = "/index.html";
  });
});
