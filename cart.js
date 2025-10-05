// ✅ Step 1: Patch backend to persist cart to cart.json

// 📁 File: cart.js (updated)
const fs = require("fs");
const path = require("path");

const cartPath = path.join(__dirname, "cart.json");

function readCart() {
  try {
    const data = fs.readFileSync(cartPath, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  try {
    fs.writeFileSync(cartPath, JSON.stringify(cart, null, 2));
    return true;
  } catch (e) {
    console.error("❌ Failed to save cart:", e);
    return false;
  }
}

function addToCart(item) {
  const cart = readCart();
  const index = cart.findIndex(i => i.name === item.name);
  if (index !== -1) {
    cart[index].quantity = (cart[index].quantity || 1) + 1;
    cart[index].deposit = item.deposit;
    cart[index].description = item.description;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  return saveCart(cart);
}

function clearCart() {
  return saveCart([]);
}

module.exports = { readCart, saveCart, addToCart, clearCart };
