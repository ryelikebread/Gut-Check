"use strict";
/* A stand-in for Ollama used by the tests: answers /api/tags, /api/pull and a streaming /api/chat. */
const http = require("http");

function start({ models = ["qwen3:8b"], reply = "Chief Justice Marlow: We have heard.\nJustice Vance: Too sure.\nChief Justice Marlow: Ruling: check first.", rejectThink = false, pullError = null } = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      const json = body ? JSON.parse(body) : null;
      calls.push({ path: req.url, body: json });
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      if (req.url === "/api/tags") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ models: models.map(name => ({ name })) })); }
      if (req.url === "/api/pull") {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        if (pullError) return res.end(JSON.stringify({ error: pullError }) + "\n");
        res.write(JSON.stringify({ status: "pulling", total: 100, completed: 50 }) + "\n");
        models.push(json.model);
        res.end(JSON.stringify({ status: "success" }) + "\n");
        return;
      }
      if (req.url === "/api/chat") {
        if (!models.includes(json.model)) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "model not found" })); }
        if (rejectThink && "think" in json) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "model does not support thinking" })); }
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        const parts = reply.match(/[\s\S]{1,12}/g);
        let i = 0;
        const tick = () => {
          if (i < parts.length) { res.write(JSON.stringify({ message: { role: "assistant", content: parts[i++] }, done: false }) + "\n"); setTimeout(tick, 5); }
          else res.end(JSON.stringify({ message: { role: "assistant", content: "" }, done: true }) + "\n");
        };
        return tick();
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${srv.address().port}`, calls, close: () => srv.close() })));
}
module.exports = { start };
if (require.main === module) start({ models: ["qwen3:8b"] }).then(s => console.log("fake ollama at", s.url));
