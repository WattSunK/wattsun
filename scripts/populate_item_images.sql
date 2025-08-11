-- SQL to populate items.image based on SKU
BEGIN TRANSACTION;
UPDATE items SET image = '450W.jpg' WHERE sku = '450W';
UPDATE items SET image = 'Inverter.png' WHERE sku = 'INV-5KW';
UPDATE items SET image = 'Hybrid-Inverter.png' WHERE sku = 'Hybrid-Inverter';
UPDATE items SET image = 'Charge-controller.jpg' WHERE sku = 'Charge-controller';
UPDATE items SET image = 'Solar-Panel.png' WHERE sku = 'Solar-Panel';
UPDATE items SET image = 'Lithium-battery.png' WHERE sku = 'Lithium-battery';
UPDATE items SET image = 'Gel-battery.png' WHERE sku = 'Gel-battery';
UPDATE items SET image = 'Solar-system.png' WHERE sku = 'Solar-system';
COMMIT;