const express = require('express');
const router = express.Router();

// Appliance wattages
const applianceWatts = {
  led_bulb: 10, tv: 60, fridge: 150, laptop: 60, phone: 5, radio: 15,
  fan: 40, pump: 250, iron: 1000, kettle: 1500, cooker: 1500,
  microwave: 1200, oven: 2500, freezer: 300, washer: 1200,
  heater: 2000, ac: 1500, tools: 1200, borehole: 2000, cctv: 150
};

// Kit definitions
const kits = [
  { name: '1kW Kit', maxW: 1000, price: 120000 },
  { name: '3kW Kit', maxW: 3000, price: 320000 },
  { name: '6kW Kit', maxW: 6000, price: 590000 },
  { name: '9kW Kit', maxW: 9000, price: 850000 },
  { name: '12kW Kit', maxW: 12000, price: 1150000 }
];

router.post('/Kitcalculate', (req, res) => {
  const usage = req.body;
  let totalPower = 0;

  for (const [item, qty] of Object.entries(usage)) {
    const watts = applianceWatts[item] || 0;
    totalPower += watts * (parseInt(qty) || 0);
  }

  const suitableKit = kits.find(kit => totalPower <= kit.maxW) || kits[kits.length - 1];

  const deposit = Math.round(suitableKit.price * 0.1);
  res.json({
    power: totalPower,
    deposit: deposit,
    recommended: suitableKit.name,
    price: suitableKit.price
  });
});

module.exports = router;