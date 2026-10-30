-- Optional subcategories under each product type. Existing products remain uncategorized.
CREATE TABLE ItemSubtype (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  ItemTypeID INTEGER NOT NULL REFERENCES ItemType(ID),
  Name1 TEXT NOT NULL,
  UNIQUE (ItemTypeID, Name1)
);
ALTER TABLE Items ADD COLUMN ItemSubtypeID INTEGER REFERENCES ItemSubtype(ID) ON DELETE SET NULL;
CREATE INDEX idx_items_subtype ON Items(ItemSubtypeID);
CREATE TRIGGER validate_item_subtype_insert BEFORE INSERT ON Items
WHEN NEW.ItemSubtypeID IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ItemSubtype WHERE ID = NEW.ItemSubtypeID AND ItemTypeID = NEW.ItemTypeID
)
BEGIN SELECT RAISE(ABORT, 'invalid_item_subtype'); END;
CREATE TRIGGER validate_item_subtype_update BEFORE UPDATE OF ItemSubtypeID, ItemTypeID ON Items
WHEN NEW.ItemSubtypeID IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ItemSubtype WHERE ID = NEW.ItemSubtypeID AND ItemTypeID = NEW.ItemTypeID
)
BEGIN SELECT RAISE(ABORT, 'invalid_item_subtype'); END;
