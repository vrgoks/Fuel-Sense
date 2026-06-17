/**
 * parser.js
 * Parses Notion CSV export and returns structured per-vehicle fuel log entries.
 * Expected headers: Vehicle type, Date, Litre, Odometer reading, Amount spent, Price/l of fuel
 */

function parseCSV(text) {
  // Strip BOM and decode HTML entities
  const clean = text.replace(/^\uFEFF/, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const lines = clean.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const idx = {
    vehicle:  headers.findIndex(h => /name|vehicle/i.test(h)),
    date:     headers.findIndex(h => /date/i.test(h)),
    litre:    headers.findIndex(h => /litre/i.test(h)),
    odo:      headers.findIndex(h => /odometer/i.test(h)),
    amount:   headers.findIndex(h => /amount/i.test(h)),
    pricepl:  headers.findIndex(h => /price/i.test(h)),
  };

  const raw = lines.slice(1).map(line => {
    if (!line.trim()) return null;
    const cols = splitCSVLine(line);
    return {
      vehicle:  cols[idx.vehicle]?.trim().toLowerCase() || '',
      date:     parseDate(cols[idx.date]?.trim()),
      litre:    parseFloat(cols[idx.litre]) || 0,
      odo:      parseFloat(cols[idx.odo])   || 0,
      amount:   parseCurrency(cols[idx.amount]),
      pricepl:  parseCurrency(cols[idx.pricepl]),
    };
  }).filter(r => r && r.odo > 0 && r.date !== null);

  return segregateAndEnrich(raw);
}

function parseCurrency(str) {
  if (!str) return 0;
  // Remove ₹, HTML entities, spaces, then remove commas inside numbers
  return parseFloat(str.replace(/₹|Rs\.?|INR/gi, '').replace(/,/g, '').trim()) || 0;
}

function parseDate(str) {
  if (!str) return null;
  // ISO: 2024-06-15
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str); return isNaN(d) ? null : d;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`);
    return isNaN(d) ? null : d;
  }
  // "June 15, 2024" or "15 June 2024"
  const d = new Date(str); return isNaN(d) ? null : d;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function segregateAndEnrich(rows) {
  const vehicles = {};

  rows.forEach(r => {
    const key = /car|auto|swift|innova|sedan|suv|alto|baleno|brezza/i.test(r.vehicle) ? 'car' : 'bike';
    if (!vehicles[key]) vehicles[key] = [];
    vehicles[key].push(r);
  });

  Object.keys(vehicles).forEach(key => {
    const entries = vehicles[key].sort((a, b) => a.date - b.date);
    entries.forEach((e, i) => {
      if (i === entries.length - 1) {
        e.distance = null;
        e.kmpl = null;
        e.costPerKm = null;
      } else {
        e.distance = entries[i + 1].odo - e.odo;
        e.kmpl = (e.distance > 0 && e.litre > 0) ? +(e.distance / e.litre).toFixed(2) : null;
        e.costPerKm = (e.distance > 0 && e.amount > 0) ? +(e.amount / e.distance).toFixed(2) : null;
      }
    });
    vehicles[key] = entries;
  });

  return vehicles;
}
