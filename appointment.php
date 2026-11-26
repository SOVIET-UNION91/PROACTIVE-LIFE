<?php
/**
 * Proactive Life – appointment notifications
 * Receives the booking form and notifies you by EMAIL and (optionally) TELEGRAM.
 * Upload this file to  forms/appointment.php  on a PHP host.
 */

/* ======== SETTINGS – edit these ======== */
$OWNER_EMAIL    = 'you@yourdomain.com';   // <-- where booking emails are sent
$FROM_EMAIL     = 'no-reply@yourdomain.com'; // an address on your own domain (helps deliverability)
$TELEGRAM_TOKEN = '';                      // optional: bot token from @BotFather
$TELEGRAM_CHAT  = '';                      // optional: your chat id (from @userinfobot)
/* ======================================= */

header('Content-Type: application/json; charset=utf-8');

function clean($v, $max = 500) {
    $v = trim((string)$v);
    $v = str_replace(["\r", "\0"], '', $v);
    return mb_substr(strip_tags($v), 0, $max);
}
function fail($code = 400) { http_response_code($code); echo json_encode(['ok' => false]); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405);
if (!empty($_POST['website'])) { echo json_encode(['ok' => true]); exit; } // honeypot: pretend success to bots

$d = [
    'ref'     => clean($_POST['ref'] ?? '', 20),
    'type'    => clean($_POST['type'] ?? '', 60),
    'doctor'  => clean($_POST['doctor'] ?? '', 120),
    'name'    => clean($_POST['name'] ?? '', 100),
    'age'     => clean($_POST['age'] ?? '', 3),
    'gender'  => clean($_POST['gender'] ?? '', 10),
    'phone'   => clean($_POST['phone'] ?? '', 30),
    'email'   => clean($_POST['email'] ?? '', 120),
    'date'    => clean($_POST['date'] ?? '', 20),
    'time'    => clean($_POST['time'] ?? '', 30),
    'message' => clean($_POST['message'] ?? '', 1500),
];

if (mb_strlen($d['name']) < 2 || strlen(preg_replace('/\D/', '', $d['phone'])) < 7 || !$d['date'] || !ctype_digit($d['age']) || !in_array($d['gender'], ['Male', 'Female'], true)) fail(422);
if ($d['email'] && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $d['email'] = '';

// very light rate limit: 1 request / 20s per IP
$f = sys_get_temp_dir() . '/pl_appt_' . md5($_SERVER['REMOTE_ADDR'] ?? 'x');
if (is_file($f) && time() - filemtime($f) < 20) fail(429);
@touch($f);

$text = "New appointment request - Proactive Life\n"
      . "Ref: {$d['ref']}\n"
      . "Type: {$d['type']}\n"
      . "Doctor: {$d['doctor']}\n"
      . "Patient: {$d['name']}\n"
      . "Age: {$d['age']} | Gender: {$d['gender']}\n"
      . "Phone: {$d['phone']}\n"
      . ($d['email'] ? "Email: {$d['email']}\n" : '')
      . "Date: {$d['date']} ({$d['time']})\n"
      . ($d['message'] ? "Concern: {$d['message']}\n" : '');

$sent = false;

// 1) Email
if ($OWNER_EMAIL && strpos($OWNER_EMAIL, 'yourdomain.com') === false) {
    $headers = "From: Proactive Life <{$FROM_EMAIL}>\r\n"
             . ($d['email'] ? "Reply-To: {$d['email']}\r\n" : '')
             . "Content-Type: text/plain; charset=UTF-8\r\n";
    $subject = "New appointment: {$d['name']} - {$d['doctor']} - {$d['date']}";
    $sent = @mail($OWNER_EMAIL, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers) || $sent;
}

// 2) Telegram (instant phone notification)
if ($TELEGRAM_TOKEN && $TELEGRAM_CHAT) {
    $ctx = stream_context_create(['http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query(['chat_id' => $TELEGRAM_CHAT, 'text' => $text]),
        'timeout' => 8,
    ]]);
    $r = @file_get_contents("https://api.telegram.org/bot{$TELEGRAM_TOKEN}/sendMessage", false, $ctx);
    if ($r && strpos($r, '"ok":true') !== false) $sent = true;
}

echo json_encode(['ok' => $sent]);
