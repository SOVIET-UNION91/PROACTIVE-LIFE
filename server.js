// Proactive Life - appointment SMS backend
// Node.js 18+, no npm dependencies. Sends an SMS to the clinic via Twilio.
const http = require('http');

const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);       // e.g. https://proactivelife.org
const CLINIC_SMS_TO = process.env.CLINIC_SMS_TO || '+923329629300';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;            // your Twilio number, e.g. +1xxxxxxxxxx
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 5);  // requests per IP
const RATE_WINDOW_MS = 10 * 60 * 1000;                  // per 10 minutes
const MAX_BODY = 16 * 1024;

const rate = new Map();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? xff.split(',')[0] : req.socket.remoteAddress || '').trim();
}

function overLimit(ip) {
  const now = Date.now();
  const r = rate.get(ip);
  if (!r || now - r.start > RATE_WINDOW_MS) { rate.set(ip, { count: 1, start: now }); return false; }
  r.count += 1;
  return r.count > RATE_LIMIT;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function validate(d) {
  const errors = [];
  if (clean(d.name, 100).length < 2) errors.push('name');
  if (clean(d.phone, 30).replace(/\D/g, '').length < 7) errors.push('phone');
  if (!clean(d.date, 20)) errors.push('date');
  if (!clean(d.ref, 20)) errors.push('ref');
  return errors;
}

function buildMessage(d) {
  const parts = [
    `PL Appt ${clean(d.ref, 20)}`,
    `${clean(d.name, 60)}, ${clean(d.age, 3)}/${clean(d.gender, 10)}`,
    `${clean(d.type, 40)} w/ ${clean(d.doctor, 40)}`,
    `${clean(d.date, 20)} ${clean(d.time, 20)}`,
    `Ph ${clean(d.phone, 25)}`
  ];
  if (d.message) parts.push(`Note: ${clean(d.message, 120)}`);
  return parts.join(' | ').slice(0, 480);
}

async function sendSms(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log('[DRY RUN - no Twilio credentials set]', to, body);
    return { sent: false, dryRun: true };
  }
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString()
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${json.message || 'unknown error'}`);
  return { sent: true, sid: json.sid };
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });

  if (req.method !== 'POST' || req.url !== '/api/appointment-sms') {
    return send(res, 404, { ok: false, error: 'not found' });
  }

  if (overLimit(clientIp(req))) return send(res, 429, { ok: false, error: 'too many requests' });

  let data;
  try { data = JSON.parse(await readBody(req)); }
  catch { return send(res, 400, { ok: false, error: 'invalid request' }); }

  // Honeypot: real users leave this empty; bots fill it. Pretend success.
  if (data.website) return send(res, 200, { ok: true });

  const bad = validate(data);
  if (bad.length) return send(res, 422, { ok: false, error: 'invalid fields', fields: bad });

  try {
    const result = await sendSms(CLINIC_SMS_TO, buildMessage(data));
    return send(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error('SMS failed:', err.message);
    return send(res, 502, { ok: false, error: 'sms failed' });
  }
});

server.listen(PORT, () => console.log(`SMS backend listening on :${PORT}`));
