// public/js/login.js

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!email || !password) {
      loginError.textContent = "Please enter email and password.";
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        loginError.textContent = data.error || "Login failed.";
        return;
      }

      localStorage.setItem("wattsun_user", JSON.stringify(data.user));
      window.location.href = "/admin/index.html";
    } catch (err) {
      loginError.textContent = "Server error. Please try again.";
    }
  });
});
