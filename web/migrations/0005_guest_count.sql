-- Existing orders represent one guest unless a party size was recorded.
ALTER TABLE TableOrders ADD COLUMN GuestCount INTEGER NOT NULL DEFAULT 1 CHECK(GuestCount BETWEEN 1 AND 5);
