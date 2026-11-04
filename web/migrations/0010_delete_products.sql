-- Keep product IDs and names for historical receipts and accounting reversals.
ALTER TABLE Items ADD COLUMN DeletedAt TEXT;
CREATE TRIGGER prevent_deleting_open_order_item
BEFORE UPDATE OF DeletedAt ON Items
WHEN NEW.DeletedAt IS NOT NULL AND EXISTS (
  SELECT 1 FROM TableOrders o, json_each(o.ItemsJSON) line
  WHERE o.Status = 'open' AND json_extract(line.value, '$.itemID') = OLD.ID
)
BEGIN SELECT RAISE(ABORT, 'product_in_open_order'); END;

-- Check inside the write transaction as well as when normalizing the order.
CREATE TRIGGER prevent_deleted_order_item
BEFORE UPDATE OF ItemsJSON ON TableOrders
WHEN NEW.Status = 'open' AND EXISTS (
  SELECT 1 FROM json_each(NEW.ItemsJSON) line JOIN Items i
  ON i.ID = json_extract(line.value, '$.itemID') WHERE i.DeletedAt IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'product_deleted'); END;
