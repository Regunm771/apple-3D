const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const deviceState = {
  fan: false,
  humidifier: false,
  infraredCamera: true,
};

const sensors = {
  temperature: 2.3,
  humidity: 88,
  ethylene: 14,
  gas: 26,
};

const trays = Array.from({ length: 8 }, (_, idx) => ({
  id: idx + 1,
  spoilage: 0.15 + Math.random() * 0.25,
  ethyleneCard: 5 + Math.random() * 8,
}));

function drift(value, min, max, strength = 1) {
  const next = value + (Math.random() - 0.5) * strength;
  return Math.min(max, Math.max(min, Number(next.toFixed(2))));
}

function writeJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getStatePayload() {
  return { sensors, deviceState, trays, ts: Date.now() };
}

function serveFile(reqPath, res) {
  const normalized = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, normalized));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    writeJson(res, 403, { error: 'forbidden' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      writeJson(res, 404, { error: 'not found' });
      return;
    }
    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    writeJson(res, 400, { error: 'bad request' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    writeJson(res, 200, getStatePayload());
    return;
  }

  const toggleMatch = url.pathname.match(/^\/api\/device\/([a-zA-Z]+)\/toggle$/);
  if (req.method === 'POST' && toggleMatch) {
    const name = toggleMatch[1];
    if (!(name in deviceState)) {
      writeJson(res, 404, { error: 'unknown device' });
      return;
    }
    deviceState[name] = !deviceState[name];
    writeJson(res, 200, {
      type: 'device',
      deviceState,
      message: `${name} ${deviceState[name] ? '开启' : '关闭'}成功`,
      ts: Date.now(),
    });
    return;
  }

  serveFile(url.pathname, res);
});

setInterval(() => {
  sensors.temperature = drift(sensors.temperature, -2, 8, deviceState.fan ? 0.6 : 1.1);
  sensors.humidity = drift(sensors.humidity, 70, 95, deviceState.humidifier ? 0.9 : 1.4);
  sensors.ethylene = drift(sensors.ethylene, 2, 60, deviceState.fan ? 2.2 : 3.8);
  sensors.gas = drift(sensors.gas, 8, 70, 2.8);

  trays.forEach((tray) => {
    const fanImpact = deviceState.fan ? -0.02 : 0.03;
    const randomChange = (Math.random() - 0.45) * 0.05;
    tray.spoilage = Math.max(0.01, Math.min(0.99, tray.spoilage + fanImpact + randomChange));
    tray.ethyleneCard = drift(tray.ethyleneCard + tray.spoilage * 1.2, 2, 80, 2.2);
  });
}, 2000);

server.listen(PORT, () => {
  console.log(`Digital twin server listening at http://localhost:${PORT}`);
});
