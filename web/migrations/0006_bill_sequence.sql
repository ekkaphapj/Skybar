CREATE TABLE BillSequence (
  ID INTEGER PRIMARY KEY CHECK (ID = 1),
  LastValue INTEGER NOT NULL DEFAULT 0 CHECK (LastValue >= 0)
);
-- Legacy timestamp/UUID bills keep their original identity. Only short numeric
-- bills participate in the new sequence, including imported older backups.
INSERT INTO BillSequence (ID, LastValue)
SELECT 1, COALESCE(MAX(CAST(BillID AS INTEGER)), 0) FROM (
  SELECT BillID FROM TableOrders UNION ALL SELECT OrderID FROM Sell
  UNION ALL SELECT BillID FROM Account UNION ALL SELECT BillID FROM StockTransaction
) WHERE length(BillID) BETWEEN 1 AND 9 AND BillID NOT GLOB '*[^0-9]*';

CREATE TRIGGER bill_sequence_order AFTER INSERT ON TableOrders
WHEN length(NEW.BillID) BETWEEN 1 AND 9 AND NEW.BillID NOT GLOB '*[^0-9]*'
BEGIN UPDATE BillSequence SET LastValue = MAX(LastValue, CAST(NEW.BillID AS INTEGER)) WHERE ID = 1; END;
CREATE TRIGGER bill_sequence_sale AFTER INSERT ON Sell
WHEN length(NEW.OrderID) BETWEEN 1 AND 9 AND NEW.OrderID NOT GLOB '*[^0-9]*'
BEGIN UPDATE BillSequence SET LastValue = MAX(LastValue, CAST(NEW.OrderID AS INTEGER)) WHERE ID = 1; END;
CREATE TRIGGER bill_sequence_account AFTER INSERT ON Account
WHEN length(NEW.BillID) BETWEEN 1 AND 9 AND NEW.BillID NOT GLOB '*[^0-9]*'
BEGIN UPDATE BillSequence SET LastValue = MAX(LastValue, CAST(NEW.BillID AS INTEGER)) WHERE ID = 1; END;
CREATE TRIGGER bill_sequence_stock AFTER INSERT ON StockTransaction
WHEN length(NEW.BillID) BETWEEN 1 AND 9 AND NEW.BillID NOT GLOB '*[^0-9]*'
BEGIN UPDATE BillSequence SET LastValue = MAX(LastValue, CAST(NEW.BillID AS INTEGER)) WHERE ID = 1; END;
