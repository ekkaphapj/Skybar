-- These checks run inside the sale batch, so concurrent requests cannot both
-- commit the same bill or redeem the same voucher. Existing history is retained.
CREATE TRIGGER prevent_duplicate_bill
BEFORE INSERT ON Account
WHEN NEW.Type = 'รายรับ' AND NEW.BillID IS NOT NULL AND NEW.BillID <> ''
 AND EXISTS (SELECT 1 FROM Account WHERE Type = 'รายรับ' AND BillID = NEW.BillID)
BEGIN
  SELECT RAISE(ABORT, 'duplicate_bill');
END;

CREATE TRIGGER prevent_voucher_reuse
BEFORE UPDATE OF Status ON VOUCHER
WHEN NEW.Status = 1 AND OLD.Status <> 0
BEGIN
  SELECT RAISE(ABORT, 'voucher_already_used');
END;
