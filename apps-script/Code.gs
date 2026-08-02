/*******************************************************************
 * InflataPay backend — paste into Extensions → Apps Script of the
 * "RENTAL INSPECTION LOG (2026)" Google Sheet, then Deploy → Web app
 * (Execute as: Me · Access: Anyone). Written by Claude for Ryan.
 *******************************************************************/

// ================== SEED CONFIG (safe to edit) ==================
var SEED = {
  rates: [
    // [category, label, cleanRate, rollRate]
    ['BOUNCE_COMBO', 'Bouncers & Combos', 14, 6],
    ['SIX_SNS', "6in1's & Slide-n-Splash", 20, 10],
    ['SLIDE_SINGLE', "17' Slides — Single lane", 14, 10],
    ['SLIDE_DOUBLE', "17' Slides — Double lane", 16, 10],
    ['OC40_COURSE', "Obstacle 40' — Course", 20, 6],
    ['OC40_SLIDE', "Obstacle 40' — Slide", 14, 6],
    ['H2O', "H2Obstacle 45' (Course & Slide)", 20, 10],
  ],
  special: { delivery: 25, pickup: 2, hourly: 20 },
  employees: [
    // [name, role, pin, email, phone, active, inPayroll]
    ['Ryan Kennedy', 'owner', '8542', 'hello@gosparkled.com', '', true, false],
    ['Jake Jones', 'employee', '7284', 'jake@jakejonesfilms.com', '801-690-6350', true, true],
    ['Tay Burgoyne', 'employee', '3157', 'btay79146@gmail.com', '801-694-9124', true, true],
  ],
  payments: [
    // [employee, amount, periodStart, periodEnd, method, note]
    ['Tay Burgoyne', 196, '2026-05-14', '2026-06-21', 'Other', 'Recorded at setup — 8 units through Jun 21'],
  ],
  // Fixups located by unique NOTES text so they survive any row shifting
  fixupsByNote: [
    { match: 'Stains on slide. See photo.', override: { unit: 'Damsel Combo (A)' }, note: 'Jun 16 — Jake, unit was Damsel Combo (A)' },
    { match: 'Filmed deliveries. 7:30am-1pm', override: { flat: { person: 'Jake Jones', amount: 110, label: 'Filming day — 5.5 hr @ $20/hr' } }, note: 'One-off hourly deal; replaces per-delivery pay' },
    { match: 'Helped customer load slide into pickup', override: { pickupCredit: { person: 'Jake Jones', count: 1 } }, note: 'Jul 22 — Jake helped customer' },
  ],
};

var TAB = { RATES: 'IP_RATES', EMP: 'IP_EMPLOYEES', PAY: 'IP_PAYMENTS', FIX: 'IP_FIXUPS' };

// ======================= HTTP ENTRYPOINTS =======================
function doGet(e) {
  return handle_(function () {
    ensureSetup_();
    var P = e.parameter || {};
    var emp = auth_(P.user, P.pin);
    return buildPayload_(emp);
  });
}

function doPost(e) {
  return handle_(function () {
    ensureSetup_();
    var body = JSON.parse(e.postData.contents || '{}');
    var emp = auth_(body.user, body.pin);
    var isOwner = emp.role === 'owner';
    var a = body.action;

    if (a === 'addPayment') {
      requireOwner_(isOwner);
      var p = body.payment || {};
      sheet_(TAB.PAY).appendRow([Utilities.getUuid(), new Date(), String(p.employee), Number(p.amount), String(p.periodStart), String(p.periodEnd), String(p.method || ''), String(p.note || '')]);
    } else if (a === 'deletePayment') {
      requireOwner_(isOwner);
      deleteRowById_(TAB.PAY, body.id);
    } else if (a === 'saveRates') {
      requireOwner_(isOwner);
      saveRates_(body.rates, body.special);
    } else if (a === 'saveEmployee') {
      requireOwner_(isOwner);
      saveEmployee_(body.employee);
    } else if (a === 'saveFixup') {
      requireOwner_(isOwner);
      saveFixup_(body.rowKey, body.override, body.note);
    } else if (a === 'deleteFixup') {
      requireOwner_(isOwner);
      deleteFixup_(body.rowKey);
    } else if (a === 'emailPaystub') {
      requireOwner_(isOwner);
      emailPaystub_(body.employee, body.periodStart, body.periodEnd, body.paymentId);
    } else if (a === 'saveSelf') {
      saveSelf_(emp, body.profile || {});
    } else if (a !== 'ping') {
      throw new Error('Unknown action: ' + a);
    }
    emp = readEmployees_().find(function (x) { return x.name === emp.name; }) || emp;
    return buildPayload_(emp);
  });
}

function handle_(fn) {
  var out;
  try { out = { ok: true, data: fn() }; }
  catch (err) { out = { ok: false, error: String(err && err.message ? err.message : err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function auth_(user, pin) {
  pin = String(pin || '').trim();
  user = String(user || '').trim().toLowerCase();
  if (!user || !pin) throw new Error('Email/phone and PIN required');
  throttleCheck_();
  var uphone = user.replace(/\D/g, '').slice(-10);
  var emp = readEmployees_().find(function (x) {
    if (!x.active || x.pin !== pin) return false;
    var em = (x.email || '').trim().toLowerCase();
    var ph = (x.phone || '').replace(/\D/g, '').slice(-10);
    return (em && em === user) || (uphone.length === 10 && ph === uphone);
  });
  if (!emp) { throttleHit_(); throw new Error('No match for that email/phone + PIN'); }
  return emp;
}
function throttleCheck_() {
  var c = Number(CacheService.getScriptCache().get('authfail') || 0);
  if (c >= 15) throw new Error('Too many failed attempts — try again in about 10 minutes');
}
function throttleHit_() {
  var cache = CacheService.getScriptCache();
  cache.put('authfail', String(Number(cache.get('authfail') || 0) + 1), 600);
}
function requireOwner_(ok) { if (!ok) throw new Error('Owner only'); }

// ========================= SETUP / SEED =========================
function ensureSetup_() {
  var ss = SpreadsheetApp.getActive();
  ensureTab_(ss, TAB.RATES, ['Category', 'Label', 'CleanRate', 'RollRate']);
  ensureTab_(ss, TAB.EMP, ['Name', 'Role', 'PIN', 'Email', 'Phone', 'Active', 'InPayroll', 'Photo']);
  var empSh = ss.getSheetByName(TAB.EMP);
  if (String(empSh.getRange(1, 8).getValue()) !== 'Photo') empSh.getRange(1, 8).setValue('Photo');
  ensureTab_(ss, TAB.PAY, ['ID', 'DateRecorded', 'Employee', 'Amount', 'PeriodStart', 'PeriodEnd', 'Method', 'Note']);
  ensureTab_(ss, TAB.FIX, ['RowKey', 'OverrideJSON', 'Note', 'TimestampMs']);

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('seeded') === '1') return;

  var rs = sheet_(TAB.RATES);
  if (rs.getLastRow() < 2) {
    SEED.rates.forEach(function (r) { rs.appendRow(r); });
    rs.appendRow(['SPECIAL_DELIVERY', 'Per delivery setup/takedown', SEED.special.delivery, '']);
    rs.appendRow(['SPECIAL_PICKUP', 'Per customer pickup/return helped', SEED.special.pickup, '']);
    rs.appendRow(['SPECIAL_HOURLY', 'Hourly (misc, one-offs)', SEED.special.hourly, '']);
  }
  var es = sheet_(TAB.EMP);
  if (es.getLastRow() < 2) SEED.employees.forEach(function (r) { es.appendRow(r); });

  var ps = sheet_(TAB.PAY);
  if (ps.getLastRow() < 2) SEED.payments.forEach(function (r) {
    ps.appendRow([Utilities.getUuid(), new Date(), r[0], r[1], r[2], r[3], r[4], r[5]]);
  });

  var fs = sheet_(TAB.FIX);
  if (fs.getLastRow() < 2) {
    var recs = readResponses_();
    SEED.fixupsByNote.forEach(function (f) {
      var hit = recs.find(function (r) { return r.notes && r.notes.indexOf(f.match) === 0; });
      if (hit) fs.appendRow([hit.key, JSON.stringify(f.override), f.note, hit.tsMs]);
    });
  }
  props.setProperty('seeded', '1');
}

function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function sheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

// ========================= DATA READERS =========================
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Denver'; }
function fmtDate_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }

function readResponses_() {
  var ss = SpreadsheetApp.getActive();
  var recs = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!/^Form Responses/i.test(name)) return;
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return;
    var vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim().toUpperCase(); });
    var col = function () {
      for (var i = 0; i < arguments.length; i++) {
        var idx = head.indexOf(arguments[i]);
        if (idx !== -1) return idx;
      }
      return -1;
    };
    var C = {
      ts: col('TIMESTAMP'), date: col('DATE'), unit: col('UNIT'),
      cleaned: col('CLEANED', 'INSPECTED/CLEANED'), rolled: col('ROLLED'),
      hours: col('HOURS'), cond: col('[CONDITION]'),
      delivery: col('DELIVERY SETUP/TAKEDOWN'), pickup: col('CUSTOMER PICKUP/RETURNS'),
      count: col("# OF DELIVERIES/CUSTOMER PU'S"), miscHours: col('MISC. HOURS'),
      units: col('# OF UNITS'), comp: col('[COMPENSATION]'),
      notes: col('NOTES'), docs: col('DOCUMENTATION'),
    };
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var ts = C.ts !== -1 ? row[C.ts] : null;
      if (!(ts instanceof Date)) continue; // skip blank/junk rows
      var dt = C.date !== -1 && row[C.date] instanceof Date ? row[C.date] : ts;
      var g = function (i) { var v = i !== -1 ? row[i] : ''; return v == null ? '' : String(v).trim(); };
      var n = function (i) { var v = i !== -1 ? row[i] : ''; var x = Number(v); return isFinite(x) && v !== '' ? x : null; };
      recs.push({
        key: name + '#' + (r + 1),
        tsMs: ts.getTime(),
        date: fmtDate_(dt),
        dateMissing: !(C.date !== -1 && row[C.date] instanceof Date),
        unit: g(C.unit), cleaned: g(C.cleaned), rolled: g(C.rolled),
        hours: n(C.hours), condition: g(C.cond),
        delivery: g(C.delivery), pickup: g(C.pickup),
        count: n(C.count), miscHours: n(C.miscHours),
        comp: g(C.comp), notes: g(C.notes), docs: g(C.docs),
      });
    }
  });
  recs.sort(function (a, b) { return a.tsMs - b.tsMs; });
  return recs;
}

function readEmployees_() {
  var sh = sheet_(TAB.EMP);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().map(function (r, i) {
    return { row: i + 2, name: String(r[0]).trim(), role: String(r[1]).trim() || 'employee', pin: String(r[2]).trim(), email: String(r[3]).trim(), phone: String(r[4]).trim(), active: r[5] === true || String(r[5]).toUpperCase() === 'TRUE', inPayroll: r[6] === true || String(r[6]).toUpperCase() === 'TRUE', photo: String(r[7] || '') };
  }).filter(function (e) { return e.name; });
}

function readRates_() {
  var sh = sheet_(TAB.RATES);
  var out = { cats: {}, labels: {}, special: { delivery: 25, pickup: 2, hourly: 20 } };
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var cat = String(r[0]).trim(); if (!cat) return;
    if (cat === 'SPECIAL_DELIVERY') out.special.delivery = Number(r[2]) || 0;
    else if (cat === 'SPECIAL_PICKUP') out.special.pickup = Number(r[2]) || 0;
    else if (cat === 'SPECIAL_HOURLY') out.special.hourly = Number(r[2]) || 0;
    else { out.cats[cat] = { clean: Number(r[2]) || 0, roll: Number(r[3]) || 0 }; out.labels[cat] = String(r[1]); }
  });
  return out;
}

function readPayments_() {
  var sh = sheet_(TAB.PAY);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().map(function (r) {
    return { id: String(r[0]), recorded: r[1] instanceof Date ? fmtDate_(r[1]) : String(r[1]), employee: String(r[2]).trim(), amount: Number(r[3]) || 0, periodStart: r[4] instanceof Date ? fmtDate_(r[4]) : String(r[4]), periodEnd: r[5] instanceof Date ? fmtDate_(r[5]) : String(r[5]), method: String(r[6]), note: String(r[7]) };
  }).filter(function (p) { return p.id; });
}

function readFixups_() {
  var sh = sheet_(TAB.FIX);
  var map = {};
  if (sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var key = String(r[0]).trim(); if (!key) return;
    var ov = {}; try { ov = JSON.parse(r[1] || '{}'); } catch (e) {}
    map[key] = { override: ov, note: String(r[2] || ''), tsMs: Number(r[3]) || null };
  });
  return map;
}

// ======================= PRICING ENGINE =======================
function classify_(unit) {
  if (!unit) return null;
  var u = unit.toUpperCase();
  if (u.indexOf('6IN1') !== -1 || u.indexOf('SLIDE N SPLASH') !== -1) return 'SIX_SNS';
  if (u.indexOf('H2OBSTACLE') !== -1) return 'H2O';
  if (u.indexOf("OBSTACLE COURSE 40") !== -1 && u.indexOf('COURSE (') !== -1) return 'OC40_COURSE';
  if (u.indexOf("OBSTACLE COURSE 40") !== -1 && u.indexOf('SLIDE') !== -1) return 'OC40_SLIDE';
  if (u.indexOf('- SINGLE') !== -1) return 'SLIDE_SINGLE';
  if (u.indexOf('- DOUBLE') !== -1) return 'SLIDE_DOUBLE';
  if (u.indexOf('BOUNCER') !== -1 || u.indexOf('COMBO') !== -1) return 'BOUNCE_COMBO';
  return 'UNKNOWN';
}

function priceAll_() {
  var recs = readResponses_();
  var rates = readRates_();
  var fix = readFixups_();
  var emps = readEmployees_();
  var names = {}; emps.forEach(function (e) { names[e.name] = true; });
  var items = [], issues = [];

  recs.forEach(function (r) {
    var f = fix[r.key] || {};
    var o = f.override || {};
    if (o.exclude) return;
    var unit = o.unit || r.unit;
    var comp = (o.comp != null ? o.comp : r.comp) || '';
    var rowCat = unit ? classify_(unit) : '';
    var push = function (person, kind, label, amount, qty, flags) {
      var cat = (kind === 'clean' || kind === 'roll') ? rowCat : kind.toUpperCase();
      items.push({ key: r.key, tsMs: r.tsMs, date: r.date, person: person, kind: kind, cat: cat, label: label, amount: round2_(amount), qty: qty || 1, unit: unit || '', comp: comp, notes: r.notes, flags: flags || [] });
    };
    var flagPerson = function (p, ctx) {
      if (p && !names[p]) issues.push({ key: r.key, date: r.date, type: 'unknown-person', detail: ctx + ': "' + p + '" is not in your Team list' });
    };

    if (o.flat && o.flat.person) {
      push(o.flat.person, 'flat', o.flat.label || 'Adjustment', Number(o.flat.amount) || 0, 1, ['override']);
    } else {
      if (unit && (r.cleaned || r.rolled)) {
        var cat = classify_(unit);
        var rate = rates.cats[cat];
        if (!rate || cat === 'UNKNOWN') {
          issues.push({ key: r.key, date: r.date, type: 'unrated-unit', detail: 'No rate category for "' + unit + '"' });
          if (r.cleaned) push(r.cleaned, 'clean', 'Clean · ' + unit, 0, 1, ['unrated']);
          if (r.rolled) push(r.rolled, 'roll', 'Roll · ' + unit, 0, 1, ['unrated']);
        } else {
          if (r.cleaned) {
            flagPerson(r.cleaned, 'Cleaned');
            var mult = comp === 'No Pay' ? 0 : comp === 'Double Pay' ? 2 : 1;
            var fl = comp === 'No Pay' ? ['nopay'] : comp === 'Double Pay' ? ['double'] : [];
            push(r.cleaned, 'clean', 'Clean · ' + unit + (mult === 2 ? ' (2×)' : mult === 0 ? ' (no pay)' : ''), rate.clean * mult, 1, fl);
          }
          if (r.rolled) {
            flagPerson(r.rolled, 'Rolled');
            push(r.rolled, 'roll', 'Roll · ' + unit + (comp === 'No Pay' ? ' (no pay)' : ''), comp === 'No Pay' ? 0 : rate.roll, 1, comp === 'No Pay' ? ['nopay'] : []);
          }
        }
      }
      if (r.delivery) {
        flagPerson(r.delivery, 'Delivery');
        var nd = r.count || 1;
        push(r.delivery, 'delivery', 'Delivery setup/takedown ×' + nd + (unit ? ' · ' + unit : ''), rates.special.delivery * nd, nd);
      }
      if (r.pickup) {
        flagPerson(r.pickup, 'Pickup');
        var np = r.count || 1;
        push(r.pickup, 'pickup', 'Customer pickup/return ×' + np + (unit ? ' · ' + unit : ''), rates.special.pickup * np, np);
      }
      if (r.miscHours) {
        var hp = r.cleaned || r.rolled || r.delivery || r.pickup;
        if (hp) push(hp, 'hourly', 'Misc hours ×' + r.miscHours, rates.special.hourly * r.miscHours, r.miscHours, ['hourly']);
      }
    }
    if (o.pickupCredit && o.pickupCredit.person) {
      push(o.pickupCredit.person, 'pickup', 'Customer pickup/return ×' + (o.pickupCredit.count || 1) + ' (added)', rates.special.pickup * (o.pickupCredit.count || 1), o.pickupCredit.count || 1, ['override']);
    }
    if (unit && !r.cleaned && !r.rolled && !r.delivery && !r.pickup && !o.flat && !o.pickupCredit) {
      issues.push({ key: r.key, date: r.date, type: 'no-person', detail: 'Entry for "' + unit + '" has nobody credited' + (r.notes ? ' — "' + r.notes.slice(0, 60) + '"' : '') });
    }
    if (r.dateMissing) issues.push({ key: r.key, date: r.date, type: 'date-missing', detail: 'No DATE given; used the submission date' });
  });

  return { items: items, issues: issues, rates: rates, employees: emps };
}

function round2_(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function summarize_(items, payments, name) {
  var earned = 0; items.forEach(function (i) { if (i.person === name) earned += i.amount; });
  var paid = 0; payments.forEach(function (p) { if (p.employee === name) paid += p.amount; });
  return { earned: round2_(earned), paid: round2_(paid), owed: round2_(earned - paid) };
}

function leaderboard_(items) {
  var today = fmtDate_(new Date());
  var since = function (days) { var d = new Date(); d.setDate(d.getDate() - days); return fmtDate_(d); };
  var windows = { '7d': since(7), '30d': since(30), 'season': '0000-00-00' };
  var out = {};
  Object.keys(windows).forEach(function (w) {
    var from = windows[w], agg = {};
    items.forEach(function (i) {
      if (i.date < from || i.date > today) return;
      if (i.flags.indexOf('nopay') !== -1) return; // personal use isn't work
      var a = agg[i.person] = agg[i.person] || { name: i.person, cleans: 0, rolls: 0, deliveries: 0, pickups: 0 };
      if (i.kind === 'clean') a.cleans += 1;
      if (i.kind === 'roll') a.rolls += 1;
      if (i.kind === 'delivery') a.deliveries += i.qty;
      if (i.kind === 'pickup') a.pickups += i.qty;
    });
    out[w] = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.cleans - a.cleans || b.rolls - a.rolls; });
  });
  return out;
}

// ======================== PAYLOAD BUILDER ========================
function buildPayload_(emp) {
  var priced = priceAll_();
  var payments = readPayments_();
  var lb = leaderboard_(priced.items);
  var photos = {};
  priced.employees.forEach(function (e) { photos[e.name] = e.photo || ''; });
  var base = {
    role: emp.role,
    labels: priced.rates.labels,
    photos: photos,
    me: { name: emp.name, email: emp.email, phone: emp.phone, photo: emp.photo || '' },
    leaderboard: lb,
    serverTime: fmtDate_(new Date()),
  };
  if (emp.role === 'owner') {
    var units = {};
    priced.items.forEach(function (i) { if (i.unit) units[i.unit] = classify_(i.unit); });
    base.items = priced.items;
    base.payments = payments;
    base.employees = priced.employees;
    base.rates = priced.rates;
    base.fixups = readFixups_();
    base.issues = priced.issues;
    base.units = units;
    base.summaries = {};
    priced.employees.forEach(function (e) {
      if (e.inPayroll) base.summaries[e.name] = summarize_(priced.items, payments, e.name);
    });
  } else {
    base.items = priced.items.filter(function (i) { return i.person === emp.name; });
    base.payments = payments.filter(function (p) { return p.employee === emp.name; });
    base.summary = summarize_(priced.items, payments, emp.name);
  }
  return base;
}

// ========================= MUTATIONS =========================
function deleteRowById_(tab, id) {
  var sh = sheet_(tab);
  var vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { sh.deleteRow(i + 2); return; }
  }
  throw new Error('Not found: ' + id);
}

function saveRates_(cats, special) {
  var sh = sheet_(TAB.RATES);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < vals.length; i++) {
    var cat = String(vals[i][0]).trim();
    if (cats && cats[cat]) {
      sh.getRange(i + 2, 3).setValue(Number(cats[cat].clean) || 0);
      sh.getRange(i + 2, 4).setValue(Number(cats[cat].roll) || 0);
    }
    if (special) {
      if (cat === 'SPECIAL_DELIVERY' && special.delivery != null) sh.getRange(i + 2, 3).setValue(Number(special.delivery) || 0);
      if (cat === 'SPECIAL_PICKUP' && special.pickup != null) sh.getRange(i + 2, 3).setValue(Number(special.pickup) || 0);
      if (cat === 'SPECIAL_HOURLY' && special.hourly != null) sh.getRange(i + 2, 3).setValue(Number(special.hourly) || 0);
    }
  }
}

function saveEmployee_(e) {
  var sh = sheet_(TAB.EMP);
  var emps = readEmployees_();
  var pinClash = emps.find(function (x) { return x.pin === String(e.pin) && x.name !== e.name; });
  if (e.pin && pinClash) throw new Error('That PIN is already used by ' + pinClash.name);
  var hit = emps.find(function (x) { return x.name === e.name; });
  var photo = e.photo != null ? String(e.photo) : (hit ? hit.photo : '');
  var row = [e.name, e.role || 'employee', String(e.pin || ''), e.email || '', e.phone || '', e.active !== false, e.inPayroll !== false, photo];
  if (hit) sh.getRange(hit.row, 1, 1, 8).setValues([row]);
  else sh.appendRow(row);
}

function saveSelf_(emp, p) {
  var sh = sheet_(TAB.EMP);
  var pin = p.pin != null && String(p.pin).trim() !== '' ? String(p.pin).trim() : emp.pin;
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
  var clash = readEmployees_().find(function (x) { return x.pin === pin && x.name !== emp.name; });
  if (clash) throw new Error('That PIN is taken — pick a different one');
  sh.getRange(emp.row, 3).setValue(pin);
  if (p.email != null) sh.getRange(emp.row, 4).setValue(String(p.email).trim());
  if (p.phone != null) sh.getRange(emp.row, 5).setValue(String(p.phone).trim());
  if (p.photo != null) sh.getRange(emp.row, 8).setValue(String(p.photo));
}

function saveFixup_(rowKey, override, note) {
  var sh = sheet_(TAB.FIX);
  var vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(rowKey)) {
      sh.getRange(i + 2, 2).setValue(JSON.stringify(override || {}));
      sh.getRange(i + 2, 3).setValue(note || '');
      return;
    }
  }
  sh.appendRow([rowKey, JSON.stringify(override || {}), note || '', '']);
}

function deleteFixup_(rowKey) {
  var sh = sheet_(TAB.FIX);
  var vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(rowKey)) { sh.deleteRow(i + 2); return; }
  }
}

// ========================= PAYSTUB EMAIL =========================
function emailPaystub_(name, periodStart, periodEnd, paymentId) {
  var emp = readEmployees_().find(function (x) { return x.name === name; });
  if (!emp) throw new Error('Employee not found');
  if (!emp.email) throw new Error(name + ' has no email on file');
  var priced = priceAll_();
  var payments = readPayments_();
  var mine = priced.items.filter(function (i) { return i.person === name && i.date >= periodStart && i.date <= periodEnd; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var periodTotal = round2_(mine.reduce(function (s, i) { return s + i.amount; }, 0));
  var pay = paymentId ? payments.find(function (p) { return p.id === paymentId; }) : null;
  var sum = summarize_(priced.items, payments, name);

  var groups = summaryGroups_(mine, priced.rates.labels);
  var sumRows = groups.map(function (g) {
    var row = '<tr><td style="padding:7px 10px;border-bottom:1px solid #eef2f7;color:#0a1424;font-weight:700">' + esc_(g.label) +
      '</td><td style="padding:7px 10px;border-bottom:1px solid #eef2f7;text-align:center;color:#334054;font-weight:700">' + g.qty +
      '</td><td style="padding:7px 10px;border-bottom:1px solid #eef2f7;text-align:right;font-weight:700;color:#0a1424">$' + g.amt.toFixed(2) + '</td></tr>';
    (g.children || []).forEach(function (c) {
      row += '<tr><td style="padding:4px 10px 4px 26px;border-bottom:1px solid #f4f7fb;color:#6b7890;font-size:12px">· ' + esc_(c.label) +
        '</td><td style="padding:4px 10px;border-bottom:1px solid #f4f7fb;text-align:center;color:#6b7890;font-size:12px">' + c.qty +
        '</td><td style="padding:4px 10px;border-bottom:1px solid #f4f7fb;text-align:right;color:#6b7890;font-size:12px">$' + c.amt.toFixed(2) + '</td></tr>';
    });
    return row;
  }).join('');
  sumRows += '<tr><td style="padding:9px 10px;font-weight:800;color:#0a1424">Total</td><td></td><td style="padding:9px 10px;text-align:right;font-weight:800;color:#0b7db3">$' + periodTotal.toFixed(2) + '</td></tr>';
  var rows = mine.map(function (i) {
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #eef2f7;color:#334054;white-space:nowrap">' + i.date +
      '</td><td style="padding:6px 10px;border-bottom:1px solid #eef2f7;color:#0a1424">' + esc_(i.label) +
      '</td><td style="padding:6px 10px;border-bottom:1px solid #eef2f7;text-align:right;color:#0a1424;font-weight:600">$' + i.amount.toFixed(2) + '</td></tr>';
  }).join('');

  var html =
    '<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e5ebf2;border-radius:14px;overflow:hidden">' +
    '<div style="background:linear-gradient(120deg,#0b7db3,#52cbbe);padding:22px 26px;color:#fff">' +
    '<div style="font-size:22px;font-weight:800;letter-spacing:.3px">InflataPalooza</div>' +
    '<div style="opacity:.92;font-size:13px;margin-top:2px">Earnings Statement</div></div>' +
    '<div style="padding:22px 26px">' +
    '<table style="width:100%;font-size:14px;margin-bottom:14px"><tr>' +
    '<td><div style="color:#6b7890;font-size:12px">PAID TO</div><div style="font-weight:700;color:#0a1424">' + esc_(name) + '</div></td>' +
    '<td style="text-align:right"><div style="color:#6b7890;font-size:12px">PERIOD</div><div style="font-weight:700;color:#0a1424">' + periodStart + ' → ' + periodEnd + '</div></td>' +
    '</tr></table>' +
    '<div style="background:#eef4fa;color:#053b5d;font-weight:800;font-size:11.5px;letter-spacing:.8px;padding:7px 12px;border-radius:8px;margin:4px 0 10px">WORK SUMMARY</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">' +
    '<tr style="background:#f4f6fb"><th style="text-align:left;padding:7px 10px;color:#6b7890;font-size:11px">TYPE</th><th style="padding:7px 10px;color:#6b7890;font-size:11px">QTY</th><th style="text-align:right;padding:7px 10px;color:#6b7890;font-size:11px">AMOUNT</th></tr>' +
    sumRows +
    '</table>' +
    '<div style="background:#eef4fa;color:#053b5d;font-weight:800;font-size:11.5px;letter-spacing:.8px;padding:7px 12px;border-radius:8px;margin:20px 0 10px">DETAIL</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<tr style="background:#f4f6fb"><th style="text-align:left;padding:8px 10px;color:#6b7890;font-size:11px">DATE</th><th style="text-align:left;padding:8px 10px;color:#6b7890;font-size:11px">WORK</th><th style="text-align:right;padding:8px 10px;color:#6b7890;font-size:11px">AMOUNT</th></tr>' +
    rows +
    '<tr><td></td><td style="padding:10px;text-align:right;font-weight:700;color:#0a1424">Period total</td><td style="padding:10px;text-align:right;font-weight:800;color:#0b7db3">$' + periodTotal.toFixed(2) + '</td></tr>' +
    (pay ? '<tr><td></td><td style="padding:4px 10px;text-align:right;color:#334054">Payment (' + esc_(pay.method || 'paid') + ' · ' + pay.recorded + ')</td><td style="padding:4px 10px;text-align:right;color:#52b662;font-weight:700">−$' + pay.amount.toFixed(2) + '</td></tr>' : '') +
    '</table>' +
    '<div style="margin-top:16px;background:#f4f6fb;border-radius:10px;padding:12px 14px;font-size:13px;color:#334054">' +
    'Season to date — Earned <b>$' + sum.earned.toFixed(2) + '</b> · Paid <b>$' + sum.paid.toFixed(2) + '</b> · Balance <b style="color:#0b7db3">$' + sum.owed.toFixed(2) + '</b></div>' +
    '<div style="margin-top:14px;color:#9aa4b8;font-size:11px">Independent contractor earnings statement · InflataPalooza · Questions? Just reply to this email.</div>' +
    '</div></div>';

  GmailApp.sendEmail(emp.email, 'InflataPalooza Earnings Statement · ' + periodStart + ' → ' + periodEnd, 'Your earnings statement is attached (HTML email).', { htmlBody: html, name: 'InflataPalooza' });
}

function summaryGroups_(items, labels) {
  var P = {
    clean: { label: 'Units Cleaned', order: 1, qty: 0, amt: 0, kids: {} },
    roll: { label: 'Units Rolled', order: 2, qty: 0, amt: 0, kids: {} },
    delivery: { label: 'Delivery Setups/Takedowns', order: 3, qty: 0, amt: 0 },
    pickup: { label: 'Customer Pickup/Returns', order: 4, qty: 0, amt: 0 },
    misc: { label: 'Misc. Hours', order: 5, qty: 0, amt: 0 },
  };
  items.forEach(function (i) {
    if (i.kind === 'clean') {
      P.clean.qty += 1; P.clean.amt += i.amount;
      var k = i.cat || '?';
      var c = P.clean.kids[k] = P.clean.kids[k] || { label: (labels || {})[k] || k, qty: 0, amt: 0 };
      c.qty += 1; c.amt += i.amount;
    } else if (i.kind === 'roll') {
      P.roll.qty += 1; P.roll.amt += i.amount;
      var rk = i.cat || '?';
      var rc = P.roll.kids[rk] = P.roll.kids[rk] || { label: (labels || {})[rk] || rk, qty: 0, amt: 0 };
      rc.qty += 1; rc.amt += i.amount;
    }
    else if (i.kind === 'delivery') { P.delivery.qty += i.qty; P.delivery.amt += i.amount; }
    else if (i.kind === 'pickup') { P.pickup.qty += i.qty; P.pickup.amt += i.amount; }
    else { P.misc.qty += i.qty; P.misc.amt += i.amount; }
  });
  return Object.keys(P).map(function (k) { return P[k]; })
    .filter(function (g) { return g.qty > 0 || g.amt !== 0; })
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (g) {
      var kids = g.kids ? Object.keys(g.kids).map(function (k) { return g.kids[k]; })
        .sort(function (a, b) { return a.label < b.label ? -1 : 1; })
        .map(function (c) { return { label: c.label, qty: c.qty, amt: round2_(c.amt) }; }) : [];
      return { label: g.label, qty: g.qty, amt: round2_(g.amt), children: kids };
    });
}

function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
