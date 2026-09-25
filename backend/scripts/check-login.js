const http = require("http");

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  try {
    const h = await get("http://127.0.0.1:4000/api/health");
    console.log("health", h.status, h.data);
  } catch (e) {
    console.log("health FAIL", e.message);
  }
  try {
    const l = await post("http://127.0.0.1:4000/api/auth/login", {
      email: "admin@phoenixcrossdock.com",
      password: "ChangeMe123!",
    });
    console.log("login", l.status, l.data.slice(0, 200));
  } catch (e) {
    console.log("login FAIL", e.message);
  }
})();
