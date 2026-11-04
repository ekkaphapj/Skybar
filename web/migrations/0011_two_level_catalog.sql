-- Sellable Items are the second (and final) level under ItemType.
-- Preserve unused legacy subtype names as editable products with an initial price of zero.
INSERT INTO Items (ID, Name1, ItemTypeID, Date1, Owner, Price)
SELECT (SELECT COALESCE(MAX(ID), 0) FROM Items) + ROW_NUMBER() OVER (ORDER BY st.ID),
  st.Name1, st.ItemTypeID, date('now', '+5 hours'), 'system', 0
FROM ItemSubtype st JOIN ItemType t ON t.ID = st.ItemTypeID
WHERE t.Name1 <> 'ส่วนลด'
  AND NOT EXISTS (SELECT 1 FROM Items i WHERE i.ItemSubtypeID = st.ID)
  AND NOT EXISTS (SELECT 1 FROM Items i WHERE i.ItemTypeID = st.ItemTypeID AND i.Name1 = st.Name1);
INSERT INTO Stock (ItemID, Amount, Date1, Time1)
SELECT i.ID, 0, date('now', '+5 hours'), time('now', '+7 hours') FROM Items i
WHERE NOT EXISTS (SELECT 1 FROM Stock s WHERE s.ItemID = i.ID);
UPDATE Items SET ItemSubtypeID = NULL WHERE ItemSubtypeID IS NOT NULL;
-- Legacy grouping rows stay in backups; they are no longer a catalog level.
CREATE TRIGGER catalog_two_levels_insert BEFORE INSERT ON Items
WHEN NEW.ItemSubtypeID IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'catalog_two_levels'); END;
CREATE TRIGGER catalog_two_levels_update BEFORE UPDATE OF ItemSubtypeID ON Items
WHEN NEW.ItemSubtypeID IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'catalog_two_levels'); END;
