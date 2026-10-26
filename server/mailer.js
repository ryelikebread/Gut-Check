"use strict";
/* Minimal SMTP client (Node standard library only) for review reminder emails.
   Supports implicit TLS (port 465), STARTTLS (587/25) and plain (for a local relay or tests). */
const net = require("net");
const tls = require("tls");

function sendMail(cfg, { to, subject, text }) {
  const port = +cfg.port || 587;
  const secure = cfg.secure || (port === 465 ? "tls" : "starttls"); // "tls" | "starttls" | "none"
  const host = cfg.host;
  const from = cfg.from || cfg.user;
  const recipients = String(to).split(",").map(s => s.trim()).filter(Boolean);
  if (!host || !from || !recipients.length) return Promise.reject(new Error("SMTP_HOST, SMTP_FROM and REMINDER_EMAIL_TO are required"));

  return new Promise((resolve, reject) => {
    let sock, buf = "", waiting = null, done = false;
    const fail = err => { if (done) return; done = true; try { sock && sock.destroy(); } catch (e) {} reject(err); };
    const timer = setTimeout(() => fail(new Error("SMTP timed out")), 30000);
    const attach = s => {
      sock = s;
      s.on("data", d => { buf += d.toString("utf8"); check(); });
      s.on("error", fail);
    };
    // A complete reply ends with a line "NNN text" (a space, not a dash, after the code).
    const check = () => {
      const m = /(?:^|\r?\n)(\d{3}) [^\r\n]*\r?\n$/.exec(buf);
      if (m && waiting) { const code = +m[1], txt = buf; buf = ""; const w = waiting; waiting = null; w(code, txt); }
    };
    const expect = (ok) => new Promise((res, rej) => {
      waiting = (code, txt) => (ok.includes(Math.floor(code / 100) * 100) || ok.includes(code) ? res(txt) : rej(new Error("SMTP " + txt.trim().split("\n").pop())));
      check();
    });
    const cmd = (line, ok = [200, 300]) => { const p = expect(ok); sock.write(line + "\r\n"); return p; };

    const run = async () => {
      await expect([200]);
      let ehlo = await cmd("EHLO gut-check");
      if (secure === "starttls") {
        if (!/STARTTLS/i.test(ehlo)) throw new Error("server doesn't offer STARTTLS (set SMTP_SECURE=none to send unencrypted)");
        await cmd("STARTTLS");
        sock.removeAllListeners("data");
        await new Promise((res, rej) => {
          const t = tls.connect({ socket: sock, servername: host }, res);
          t.on("error", rej);
          attach(t);
        });
        ehlo = await cmd("EHLO gut-check");
      }
      if (cfg.user) {
        await cmd("AUTH PLAIN " + Buffer.from("\0" + cfg.user + "\0" + (cfg.pass || "")).toString("base64"));
      }
      await cmd(`MAIL FROM:<${from.replace(/^.*<|>.*$/g, "")}>`);
      for (const r of recipients) await cmd(`RCPT TO:<${r.replace(/^.*<|>.*$/g, "")}>`);
      await cmd("DATA", [300]);
      const date = new Date().toUTCString();
      const subj = /^[\x20-\x7e]*$/.test(subject) ? subject : "=?UTF-8?B?" + Buffer.from(subject).toString("base64") + "?=";
      const body = text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
      const msg = [`From: ${from}`, `To: ${recipients.join(", ")}`, `Subject: ${subj}`, `Date: ${date}`, `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@gut-check>`,
        "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", body, "."].join("\r\n");
      await cmd(msg, [200]);
      try { await cmd("QUIT", [200]); } catch (e) {}
    };

    const onConnect = () => run().then(() => { if (!done) { done = true; clearTimeout(timer); try { sock.end(); } catch (e) {} resolve(); } }).catch(fail);
    if (secure === "tls") attach(tls.connect({ host, port, servername: host }, onConnect));
    else attach(net.connect({ host, port }, onConnect));
    sock.on("error", e => { clearTimeout(timer); fail(e); });
  });
}

module.exports = { sendMail };
