-- The Cottage Sky Bar POS - schema migrated from Access (Skybar.mdb / SkybarCoupon.mdb)
-- Dates stored as TEXT 'YYYY-MM-DD' (business date: before 02:00 Bangkok time counts as the previous day)

CREATE TABLE ItemType (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name1 TEXT NOT NULL UNIQUE
);

CREATE TABLE Items (
  ID INTEGER PRIMARY KEY,
  Name1 TEXT NOT NULL,
  ItemTypeID INTEGER NOT NULL REFERENCES ItemType(ID),
  Date1 TEXT,
  Owner TEXT,
  Price REAL NOT NULL DEFAULT 0
);

CREATE TABLE Stock (
  ItemID INTEGER PRIMARY KEY REFERENCES Items(ID),
  Amount INTEGER NOT NULL DEFAULT 0,
  Date1 TEXT,
  Time1 TEXT
);

CREATE TABLE Sell (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Date1 TEXT NOT NULL,
  Time1 TEXT NOT NULL,
  ItemID INTEGER NOT NULL REFERENCES Items(ID),
  Amount INTEGER NOT NULL,
  Price REAL NOT NULL,
  PaymentType TEXT,
  OrderID TEXT,
  Owner TEXT,
  RoomNo INTEGER NOT NULL DEFAULT 0,
  Cusname TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_sell_date ON Sell(Date1);
CREATE INDEX idx_sell_order ON Sell(OrderID);

CREATE TABLE StockTransaction (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  TransactionType TEXT,
  Amount INTEGER,
  Price REAL,
  DateRecord TEXT,
  Date2 TEXT,
  Place TEXT,
  ItemID INTEGER,
  PaymentType TEXT,
  Owner TEXT,
  Comment TEXT,
  BillID TEXT
);

CREATE TABLE Account (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Date1 TEXT,
  Time1 TEXT,
  PaymentType TEXT,
  Amount REAL,
  Type TEXT,
  BillID TEXT,
  StockTransactionID INTEGER,
  Owner TEXT,
  List TEXT
);
CREATE INDEX idx_account_date ON Account(Date1);

CREATE TABLE CASH (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  Date1 TEXT,
  Type1 TEXT,
  List TEXT,
  Time1 TEXT,
  Amount REAL,
  AccountID INTEGER
);
CREATE INDEX idx_cash_date ON CASH(Date1);

CREATE TABLE VOUCHER (
  ID INTEGER PRIMARY KEY,
  Date1 TEXT NOT NULL,
  Status INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_voucher_date ON VOUCHER(Date1);

-- Seed item types (ส่วนลด is a special discount pseudo-item, same as the original system)
INSERT INTO ItemType (ID, Name1) VALUES
  (1, 'เครื่องดื่มแอลกอฮอล์'),
  (2, 'เครื่องดื่มไม่มีแอลกอฮอล์'),
  (3, 'อาหาร'),
  (4, 'อื่นๆ'),
  (5, 'ส่วนลด');
