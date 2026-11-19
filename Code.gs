/**
 * Utläggskollen – backend i Google Apps Script
 * --------------------------------------------
 * Sparar utlägg i det här Google-arket och hämtar växelkurser.
 * Kursordning: Mastercard -> Visa -> ECB (reserv). Kurserna jämförs
 * alltid mot ECB så att en felaktig hämtning inte smyger sig in.
 *
 * Du behöver inte ändra något i den här filen.
 */

const FLIK_UTLAGG = 'Utlägg';
const FLIK_PERSONER = 'Personer';
const UTLAGG_KOLUMNER = ['id', 'resa', 'skapad', 'datum', 'betalare', 'beskrivning',
  'belopp', 'valuta', 'kurs', 'kurskalla', 'beloppSEK', 'delasAv'];
const PERSON_KOLUMNER = ['resa', 'namn'];
const MAX_AVVIKELSE = 0.08;          // max 8 % avvikelse mot ECB
const CACHE_SEKUNDER = 3 * 60 * 60;  // kurser cachas i 3 timmar

/* ---------------- HTTP ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'rate') return svar(hamtaKurs(p.currency));
    if (p.action === 'list') return svar(lista(p.resa));
    return svar({ ok: true, meddelande: 'Utläggskollen är igång' });
  } catch (err) {
    return svar({ error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'add') return svar(laggTillUtlagg(body.expense));
    if (body.action === 'delete') return svar(taBortUtlagg(body.resa, body.id));
    if (body.action === 'addPerson') return svar(laggTillPerson(body.resa, body.namn));
    return svar({ error: 'Okänd åtgärd' });
  } catch (err) {
    return svar({ error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function svar(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Ark ---------------- */

function flik(namn, kolumner) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(namn);
  if (!sh) {
    sh = ss.insertSheet(namn);
    sh.appendRow(kolumner);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, kolumner.length).setFontWeight('bold');
    sh.getRange('A:Z').setNumberFormat('@'); // spara som text, ingen autoformatering
  }
  return sh;
}

function rader(sh) {
  const v = sh.getDataRange().getValues();
  const rubrik = v.shift() || [];
  return v.map(function (r, i) {
    const o = { _rad: i + 2 };
    rubrik.forEach(function (k, j) {
      let x = r[j];
      if (x instanceof Date) x = Utilities.formatDate(x, 'Europe/Stockholm', 'yyyy-MM-dd');
      o[k] = x;
    });
    return o;
  });
}

function rensaResa(resa) {
  resa = String(resa || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(resa)) throw new Error('Ogiltigt resenamn');
  return resa;
}

function rensaText(s, max) {
  return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 100);
}

function lista(resa) {
  resa = rensaResa(resa);
  const utlagg = rader(flik(FLIK_UTLAGG, UTLAGG_KOLUMNER))
    .filter(function (r) { return String(r.resa) === resa; })
    .map(function (r) {
      return {
        id: String(r.id), skapad: String(r.skapad), datum: String(r.datum),
        betalare: String(r.betalare), beskrivning: String(r.beskrivning),
        belopp: Number(r.belopp), valuta: String(r.valuta), kurs: Number(r.kurs),
        kurskalla: String(r.kurskalla), beloppSEK: Number(r.beloppSEK),
        delasAv: String(r.delasAv).split('|').filter(String)
      };
    });
  const personer = rader(flik(FLIK_PERSONER, PERSON_KOLUMNER))
    .filter(function (r) { return String(r.resa) === resa; })
    .map(function (r) { return String(r.namn); });
  return { utlagg: utlagg, personer: personer };
}

function laggTillPerson(resa, namn) {
  resa = rensaResa(resa);
  namn = rensaText(namn, 40);
  if (!namn) throw new Error('Namn saknas');
  const sh = flik(FLIK_PERSONER, PERSON_KOLUMNER);
  const finns = rader(sh).some(function (r) {
    return String(r.resa) === resa && String(r.namn).toLowerCase() === namn.toLowerCase();
  });
  if (!finns) sh.appendRow([resa, namn]);
  return lista(resa);
}

function laggTillUtlagg(x) {
  const resa = rensaResa(x.resa);
  const belopp = Number(x.belopp);
  const kurs = Number(x.kurs);
  const valuta = String(x.valuta || '').toUpperCase();
  const delasAv = (x.delasAv || []).map(function (n) { return rensaText(n, 40); }).filter(String);
  if (!(belopp > 0)) throw new Error('Ogiltigt belopp');
  if (!(kurs > 0)) throw new Error('Ogiltig växelkurs');
  if (!/^[A-Z]{3}$/.test(valuta)) throw new Error('Ogiltig valuta');
  if (!delasAv.length) throw new Error('Välj minst en person som delar');
  const betalare = rensaText(x.betalare, 40);
  if (!betalare) throw new Error('Ange vem som betalade');

  const id = Utilities.getUuid();
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(x.datum) ? x.datum
    : Utilities.formatDate(new Date(), 'Europe/Stockholm', 'yyyy-MM-dd');
  flik(FLIK_UTLAGG, UTLAGG_KOLUMNER).appendRow([
    id, resa, new Date().toISOString(), datum, betalare, rensaText(x.beskrivning, 120),
    String(belopp), valuta, String(kurs), rensaText(x.kurskalla, 60),
    String(Math.round(belopp * kurs * 100) / 100), delasAv.join('|')
  ]);
  // se till att alla inblandade finns i personlistan
  [betalare].concat(delasAv).forEach(function (n) { laggTillPerson(resa, n); });
  return lista(resa);
}

function taBortUtlagg(resa, id) {
  resa = rensaResa(resa);
  const sh = flik(FLIK_UTLAGG, UTLAGG_KOLUMNER);
  const r = rader(sh).filter(function (r) {
    return String(r.id) === String(id) && String(r.resa) === resa;
  })[0];
  if (r) sh.deleteRow(r._rad);
  return lista(resa);
}

/* ---------------- Växelkurser ---------------- */

const WEBBLASARE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8'
};

function hamtaKurs(valuta) {
  valuta = String(valuta || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(valuta)) throw new Error('Ogiltig valuta');
  const idag = Utilities.formatDate(new Date(), 'Europe/Stockholm', 'yyyy-MM-dd');
  if (valuta === 'SEK') return { valuta: 'SEK', kurs: 1, kalla: 'SEK', datum: idag };

  const cache = CacheService.getScriptCache();
  const cachad = cache.get('kurs_' + valuta);
  if (cachad) return JSON.parse(cachad);

  const ecb = forsok(function () { return ecbKurs(valuta); });
  const kandidater = [
    ['Mastercard', function () { return mastercardKurs(valuta); }],
    ['Visa', function () { return visaKurs(valuta); }]
  ];
  let resultat = null;
  for (let i = 0; i < kandidater.length && !resultat; i++) {
    const r = forsok(kandidater[i][1]);
    const kurs = r && rimlig(r.kurs, ecb && ecb.kurs);
    if (kurs) resultat = { valuta: valuta, kurs: kurs, kalla: kandidater[i][0], datum: r.datum || idag };
  }
  if (!resultat && ecb) resultat = { valuta: valuta, kurs: ecb.kurs, kalla: 'ECB', datum: ecb.datum };
  if (!resultat) throw new Error('Kunde inte hämta kurs för ' + valuta + ' – fyll i kursen själv');

  resultat.kurs = Math.round(resultat.kurs * 1e6) / 1e6;
  cache.put('kurs_' + valuta, JSON.stringify(resultat), CACHE_SEKUNDER);
  return resultat;
}

function forsok(fn) {
  try { return fn(); } catch (e) { Logger.log(e); return null; }
}

/** Godkänn kursen om den ligger nära ECB. Vänd den om källan svarat "åt andra hållet". */
function rimlig(kurs, ecb) {
  if (!(kurs > 0) || !isFinite(kurs)) return null;
  if (!ecb) return kurs;
  if (Math.abs(kurs / ecb - 1) <= MAX_AVVIKELSE) return kurs;
  if (Math.abs((1 / kurs) / ecb - 1) <= MAX_AVVIKELSE) return 1 / kurs;
  return null;
}

function hamtaJson(url, extra) {
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true, followRedirects: true,
    headers: Object.assign({}, WEBBLASARE, extra || {})
  });
  if (res.getResponseCode() !== 200) throw new Error(url + ' -> HTTP ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

function hittaNyckel(obj, nyckel) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, nyckel)) return obj[nyckel];
  for (const k in obj) {
    const v = hittaNyckel(obj[k], nyckel);
    if (v !== undefined) return v;
  }
  return undefined;
}

function tal(x) {
  const n = parseFloat(String(x == null ? '' : x).replace(/,/g, ''));
  return isFinite(n) ? n : NaN;
}

/** Mastercard: hur många SEK debiteras för 100 enheter av valutan (senaste kursen). */
function mastercardKurs(valuta) {
  const urlar = [
    'https://www.mastercard.com/marketingservices/public/mccom-services/currency-conversions/conversion-rates' +
      '?exchange_date=0000-00-00&transaction_currency=' + valuta +
      '&cardholder_billing_currency=SEK&bank_fee=0&transaction_amount=100',
    'https://www.mastercard.us/settlement/currencyrate/conversion-rate' +
      '?fxDate=0000-00-00&transCurr=' + valuta + '&crdhldBillCurr=SEK&bankFee=0&transAmt=100'
  ];
  for (let i = 0; i < urlar.length; i++) {
    const j = forsok(function () {
      return hamtaJson(urlar[i], { Referer: 'https://www.mastercard.com/global/en/personal/get-support/convert-currency.html' });
    });
    if (!j) continue;
    const debiterat = tal(hittaNyckel(j, 'crdhldBillAmt'));
    const kurs = debiterat > 0 ? debiterat / 100 : tal(hittaNyckel(j, 'conversionRate'));
    if (kurs > 0) return { kurs: kurs, datum: String(hittaNyckel(j, 'fxDate') || '').slice(0, 10) };
  }
  throw new Error('Mastercard svarade inte');
}

/** Visa: kortet i SEK, köp i vald valuta. */
function visaKurs(valuta) {
  const d = Utilities.formatDate(new Date(), 'UTC', 'MM/dd/yyyy');
  const url = 'https://www.visa.co.uk/cmsapi/fx/rates?amount=100&fee=0' +
    '&utcConvertedDate=' + encodeURIComponent(d) + '&exchangedate=' + encodeURIComponent(d) +
    '&fromCurr=SEK&toCurr=' + valuta;
  const j = hamtaJson(url, { Referer: 'https://www.visa.co.uk/support/consumer/travel-support/exchange-rate-calculator.html' });
  const belopp = tal(hittaNyckel(j, 'convertedAmount'));
  let kurs = belopp > 0 ? belopp / 100 : tal(hittaNyckel(j, 'fxRateVisa'));
  if (!(kurs > 0)) throw new Error('Visa: inget värde');
  return { kurs: kurs, datum: Utilities.formatDate(new Date(), 'Europe/Stockholm', 'yyyy-MM-dd') };
}

/** ECB:s referenskurs via Frankfurter (reserv och rimlighetskontroll). */
function ecbKurs(valuta) {
  const urlar = [
    'https://api.frankfurter.dev/v1/latest?base=' + valuta + '&symbols=SEK',
    'https://api.frankfurter.app/latest?from=' + valuta + '&to=SEK'
  ];
  for (let i = 0; i < urlar.length; i++) {
    const j = forsok(function () { return hamtaJson(urlar[i]); });
    if (j && j.rates && j.rates.SEK > 0) return { kurs: j.rates.SEK, datum: j.date };
  }
  throw new Error('ECB svarade inte');
}

/* ---------------- Test (kör manuellt i editorn) ---------------- */

/** Välj "testaKurser" i menyn ovan och tryck Kör – se resultatet under "Körningslogg". */
function testaKurser() {
  ['EUR', 'GBP', 'USD', 'NOK'].forEach(function (v) {
    CacheService.getScriptCache().remove('kurs_' + v);
    Logger.log(v + ': Mastercard=' + JSON.stringify(forsok(function () { return mastercardKurs(v); })) +
      ' | Visa=' + JSON.stringify(forsok(function () { return visaKurs(v); })) +
      ' | ECB=' + JSON.stringify(forsok(function () { return ecbKurs(v); })) +
      ' | VALD=' + JSON.stringify(forsok(function () { return hamtaKurs(v); })));
  });
}
