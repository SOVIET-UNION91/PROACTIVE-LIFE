# Appointment SMS backend

Receives appointment requests from the website and texts the clinic (+923329629300).

## 1. Get Twilio credentials
1. Create an account at twilio.com and buy an SMS-capable number.
2. Copy the Account SID and Auth Token from the console.
3. Check Twilio's Pakistan SMS guidelines: SMS to Pakistani numbers may require a registered sender ID, and delivery can be restricted without it.

## 2. Run locally
    cp .env.example .env   # fill in values
    export $(grep -v '^#' .env | xargs)
    npm start

Without Twilio values the server runs in dry-run mode: it logs the SMS instead of sending it. Useful for testing.

Test it:
    curl -X POST http://localhost:8787/api/appointment-sms \
      -H "Content-Type: application/json" \
      -d '{"ref":"PL123","name":"Test Patient","age":"30","gender":"Female","type":"In-person","doctor":"Dr. Test","phone":"+92 300 0000000","date":"2026-12-01","time":"10:00"}'

## 3. Deploy
Any Node 18+ host works (Render, Railway, Fly.io, a VPS). Set the environment variables from `.env.example` in the host's dashboard, and set `ALLOWED_ORIGINS` to your website's exact origin.

## 4. Connect the website
Point the form's fetch at the deployed URL, for example `https://your-backend.example.com/api/appointment-sms`.

## Security notes
- Twilio credentials live only on the server, never in the HTML.
- Origin allowlist, request size limit, field validation, honeypot field, and per-IP rate limit are included.
- Use HTTPS in production.
