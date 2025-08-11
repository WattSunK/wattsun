
// Corrected version to set proper localStorage key
function handleLoginResponse(data) {
  if (data.success && data.user) {
    localStorage.setItem('wattsunUser', JSON.stringify(data.user)); // ✅ Correct key
    window.location.href = data.user.type === 'admin' ? '/dashboard.html' : '/myaccount/myorders.html';
  } else {
    alert('Login failed. Please check your credentials.');
  }
}
