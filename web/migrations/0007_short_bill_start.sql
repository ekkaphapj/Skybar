-- Historical numeric bills used unrelated, often eight-digit numbers.
-- Start the new sequence at 1 and let the allocator skip existing identities.
-- This one-time initialization precedes use of the short-number allocator.
DROP TRIGGER IF EXISTS bill_sequence_order;
DROP TRIGGER IF EXISTS bill_sequence_sale;
DROP TRIGGER IF EXISTS bill_sequence_account;
DROP TRIGGER IF EXISTS bill_sequence_stock;
UPDATE BillSequence SET LastValue = 0 WHERE ID = 1;
