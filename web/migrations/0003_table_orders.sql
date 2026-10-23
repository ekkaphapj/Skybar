CREATE TABLE TableOrders (
  ID TEXT PRIMARY KEY,
  TableNo INTEGER NOT NULL CHECK(TableNo BETWEEN 1 AND 20),
  CustomerName TEXT NOT NULL DEFAULT '',
  ShopType INTEGER NOT NULL DEFAULT 0 CHECK(ShopType IN (0, 1)),
  BillID TEXT NOT NULL UNIQUE,
  Status TEXT NOT NULL DEFAULT 'open' CHECK(Status IN ('open', 'closed')),
  ItemsJSON TEXT NOT NULL DEFAULT '[]',
  Owner TEXT NOT NULL DEFAULT '',
  RoomNo INTEGER NOT NULL DEFAULT 0,
  Revision INTEGER NOT NULL DEFAULT 0,
  OpenedAt TEXT NOT NULL,
  ClosedAt TEXT,
  BusinessDate TEXT,
  PaymentType TEXT,
  Total REAL NOT NULL DEFAULT 0,
  ReceiptJSON TEXT
);
CREATE UNIQUE INDEX idx_table_orders_active ON TableOrders(TableNo) WHERE Status = 'open';
CREATE INDEX idx_table_orders_history ON TableOrders(Status, ClosedAt DESC);

-- Every save/checkout must use the version actually displayed to the cashier.
-- This also rejects a second checkout inside its transaction before stock moves.
CREATE TRIGGER table_order_version
BEFORE UPDATE ON TableOrders
WHEN OLD.Status <> 'open' OR NEW.Revision <> OLD.Revision + 1
BEGIN
  SELECT RAISE(ABORT, 'order_conflict');
END;
