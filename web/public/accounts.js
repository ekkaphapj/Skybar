/* Accounting UI shares authenticated API and formatting with app.js. */
globalThis.Ledger = (() => {
  let rows = [], items = [], types = [], subtypes = [], editing = null, request = 0, monthly = null;
  const purchase = () => !editing && $('ac-type').value === 'รายจ่าย' && $('ac-category').value === 'purchase';
  function updateForm() {
    const exchange = $('ac-type').value === 'แลกเงินสด';
    $('ac-category-field').classList.toggle('hidden', $('ac-type').value !== 'รายจ่าย' || !!editing);
    $('ac-direction-field').classList.toggle('hidden', !exchange || !!editing);
    $('ac-purchase').classList.toggle('hidden', !purchase() && !editing?.StockTransactionID);
    $('ac-payment').disabled = exchange || !!(editing?.BillID && !editing.StockTransactionID);
    if (exchange) $('ac-payment').value = 'เงินสด';
    for (const id of ['ac-main-type', 'ac-subtype', 'ac-item', 'ac-place']) $(id).disabled = !!editing;
  }
  function selectItems() {
    const main = Number($('ac-main-type').value), sub = $('ac-subtype').value;
    $('ac-item').innerHTML = items.filter(i => i.ItemTypeID === main && (!sub || (sub === 'none' ? !i.ItemSubtypeID : i.ItemSubtypeID === Number(sub))))
      .map(i => `<option value="${i.ID}">${esc(i.Name1)} · เหลือ ${num(i.Amount)}</option>`).join('');
  }
  function selectSubtypes() {
    $('ac-subtype').innerHTML = '<option value="">ทุกประเภทย่อย</option><option value="none">ไม่ระบุประเภทย่อย</option>' + subtypes.filter(s => s.ItemTypeID === Number($('ac-main-type').value)).map(s => `<option value="${s.ID}">${esc(s.Name1)}</option>`).join('');
    selectItems();
  }
  function reset() {
    editing = null; $('ac-form').reset(); $('ac-date').value = $('ac-from').value || businessDate();
    $('ac-type').disabled = false; $('ac-date').disabled = false; $('ac-amount').disabled = false;
    $('ac-amount').min = '0.01';
    $('ac-form-title').textContent = 'บันทึกรายการ'; $('ac-edit-note').textContent = ''; $('ac-error').textContent = '';
    $('ac-cancel').classList.add('hidden'); updateForm(); selectSubtypes();
  }
  async function load() {
    const seq = ++request;
    const r = await api('/api/accounts?' + new URLSearchParams({ from: $('ac-from').value, to: $('ac-to').value }));
    if (seq !== request) return;
    rows = r.rows;
    const sum = type => rows.filter(r => r.Type === type).reduce((n, r) => n + r.Amount, 0);
    $('ac-summary').textContent = `รายรับ ${fmt2(sum('รายรับ'))} · รายจ่าย ${fmt2(sum('รายจ่าย'))} · คงเหลือ ${fmt2(sum('รายรับ') - sum('รายจ่าย'))} บาท · ${rows.length} รายการ`;
    fillTable('ac-table', rows, r => [esc(r.Date1), esc(r.Type + ' · ' + r.DisplayCategory), esc(r.List) + (r.Note ? '<br>' + esc(r.Note) : ''), r.Quantity == null ? '–' : `${esc(r.ItemName)} × ${num(r.Quantity)}`, fmt2(r.Amount), esc(r.PaymentType), esc(r.Owner), currentUser?.role === 'admin' ? `<div class="row"><button class="btn" data-edit-ledger="${r.ID}">แก้ไข</button><button class="btn danger" data-delete-ledger="${r.ID}">ลบ</button></div>` : '–']);
  }
  async function init() {
    [items, types, subtypes] = await Promise.all([api('/api/items'), api('/api/item-types'), api('/api/item-subtypes')]);
    $('ac-main-type').innerHTML = types.filter(t => t.Name1 !== 'ส่วนลด').map(t => `<option value="${t.ID}">${esc(t.Name1)}</option>`).join('');
    if (!$('ac-from').value) $('ac-from').value = $('ac-to').value = businessDate();
    reset(); await load();
  }
  function edit(id) {
    const row = rows.find(r => r.ID === id); if (!row || currentUser?.role !== 'admin') return;
    reset(); editing = row;
    $('ac-type').value = row.Type; $('ac-type').disabled = true;
    $('ac-date').value = row.Date1; $('ac-list').value = row.Note || row.List; $('ac-amount').value = row.Amount;
    $('ac-payment').value = row.PaymentType; $('ac-qty').value = row.Quantity || 1;
    if (row.StockTransactionID) {
      $('ac-main-type').value = row.ItemTypeID; selectSubtypes(); $('ac-subtype').value = row.ItemSubtypeID || 'none'; selectItems(); $('ac-item').value = row.ItemID; $('ac-place').value = row.Place;
    }
    const sale = !!row.BillID && !row.StockTransactionID;
    $('ac-date').disabled = sale; $('ac-amount').disabled = sale; $('ac-amount').min = '0';
    $('ac-form-title').textContent = 'แก้ไขรายการ #' + row.ID;
    $('ac-edit-note').textContent = sale ? 'บิลขายแก้ไขหมายเหตุได้ หากยอดหรือสินค้าผิด ให้ลบบิลแล้วเปิดขายใหม่ เพื่อให้ใบเสร็จและสต็อกตรงกัน' : row.StockTransactionID ? 'แก้ไขจำนวนซื้อและยอดเงินได้ ระบบปรับสต็อกและเงินสดตามผลต่างอัตโนมัติ' : 'ระบบปรับเงินสดตามรายการที่แก้ไขอัตโนมัติ';
    $('ac-cancel').classList.remove('hidden'); updateForm(); $('ac-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function save(event) {
    event.preventDefault(); $('ac-save').disabled = true; $('ac-error').textContent = '';
    try {
      if (editing) {
        await api('/api/accounts/' + editing.ID, { method: 'PUT', body: { revision: editing.Revision, date: $('ac-date').value, list: $('ac-list').value, amount: Number($('ac-amount').value), paymentType: $('ac-payment').value, quantity: Number($('ac-qty').value) } });
      } else if (purchase()) {
        await api('/api/stock/transaction', { method: 'POST', body: { action: 'purchase', itemID: Number($('ac-item').value), amount: Number($('ac-qty').value), price: Number($('ac-amount').value), date2: $('ac-date').value, place: $('ac-place').value, comment: $('ac-list').value, paymentType: $('ac-payment').value } });
      } else {
        await api('/api/accounts', { method: 'POST', body: { type: $('ac-type').value, date: $('ac-date').value, list: $('ac-list').value, amount: Number($('ac-amount').value), paymentType: $('ac-payment').value, category: $('ac-direction').value } });
      }
      reset(); await load(); toast('บันทึกรายการแล้ว');
    } catch (e) { $('ac-error').textContent = e.message; }
    finally { $('ac-save').disabled = false; }
  }
  async function remove(id) {
    if (currentUser?.role !== 'admin') return;
    const row = rows.find(r => r.ID === id); if (!row) return;
    if (!confirm(row.BillID && !row.StockTransactionID ? 'ลบบิลขายทั้งบิล พร้อมคืนสต็อกและย้อนรายการเงินสด?' : 'ลบรายการนี้ พร้อมย้อนสต็อกและเงินสดที่เกี่ยวข้อง?')) return;
    await api('/api/accounts/' + id, { method: 'DELETE' });
    if (editing?.ID === id) reset(); await load(); toast('ลบรายการแล้ว');
  }
  async function createMonthly() {
    if (currentUser?.role !== 'admin') return;
    const button = $('btn-report-monthly'); button.disabled = true;
    monthly = null; $('btn-report-monthly-download').disabled = true;
    const seq = ++reportRequest;
    try {
      const r = await api('/api/report/monthly?' + new URLSearchParams({ year: $('rp-year').value, month: $('rp-month').value }));
      if (seq !== reportRequest) return;
      monthly = r; $('rp-from').value = r.from; $('rp-to').value = r.to;
      renderReport(r, r.from, r.to, seq); $('btn-report-monthly-download').disabled = false;
      $('report-period').textContent = `รายงานประจำเดือน ${$('rp-month').selectedOptions[0].textContent} ปี ${Number($('rp-year').value) + 543} · ${r.from} ถึง ${r.to}`;
    } finally { button.disabled = false; }
  }
  function downloadMonthly() {
    if (!monthly || currentUser?.role !== 'admin') return;
    const r = monthly, csv = v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const data = [['รายงานประจำเดือน', r.from.slice(0, 7)], ['ยอดขาย', r.totalIncome], ['รายจ่าย', r.sums.cost], ['คงเหลือ (ยอดขาย−รายจ่าย)', r.balance], [], ['สินค้า', 'จำนวนขาย', 'ยอดขายรวม (บาท)'], ...r.sellByDate.map(x => [x.name, x.qty, x.total])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + data.map(row => row.map(csv).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `skybar-monthly-${r.from.slice(0, 7)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function wire() {
    const task = fn => () => fn().catch(e => toastErr(e.message));
    $('ac-form').onsubmit = save; $('ac-cancel').onclick = reset;
    $('ac-type').onchange = updateForm; $('ac-category').onchange = updateForm;
    $('ac-main-type').onchange = selectSubtypes; $('ac-subtype').onchange = selectItems;
    $('ac-search').onclick = task(load); $('ac-today').onclick = task(async () => { $('ac-from').value = $('ac-to').value = businessDate(); await load(); });
    $('ac-table').onclick = e => {
      const editButton = e.target.closest('[data-edit-ledger]'), deleteButton = e.target.closest('[data-delete-ledger]');
      if (editButton) edit(Number(editButton.dataset.editLedger));
      if (deleteButton) remove(Number(deleteButton.dataset.deleteLedger)).catch(e => toastErr(e.message));
    };
    const year = Number(businessDate().slice(0, 4));
    $('rp-year').innerHTML = Array.from({ length: 30 }, (_, n) => year + 1 - n).map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y + 543}</option>`).join('');
    $('rp-month').innerHTML = Array.from({ length: 12 }, (_, n) => `<option value="${n + 1}">${new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(new Date(2026, n, 15))}</option>`).join('');
    $('rp-month').value = Number(businessDate().slice(5, 7));
    $('btn-report-monthly').onclick = task(createMonthly); $('btn-report-monthly-download').onclick = downloadMonthly;
  }
  function resetMonthly() { monthly = null; $('btn-report-monthly-download').disabled = true; }
  return { wire, init, resetMonthly };
})();
