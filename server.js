const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const clients = new Set();
const publicDir = path.join(__dirname, 'public');

const INSTRUMENTS = {
  EURUSD: { type: 'forex', price: 1.08 },
  GBPUSD: { type: 'forex', price: 1.27 },
  USDJPY: { type: 'forex', price: 149.2 },
  XAUUSD: { type: 'commodity', price: 2150 },
  XAGUSD: { type: 'commodity', price: 24.8 },
  WTI: { type: 'commodity', price: 76.4 }
};

const state = Object.fromEntries(
  Object.entries(INSTRUMENTS).map(([symbol, meta]) => [symbol, {
    ...meta,
    candles: [],
    lastSetupAt: 0
  }])
);

const timeframeSec = 5;

function randomStep(base) {
  const scale = base > 100 ? base * 0.0009 : base * 0.0005;
  return (Math.random() - 0.5) * scale;
}

function makeCandle(symbol) {
  const inst = state[symbol];
  const prevClose = inst.candles.length ? inst.candles[inst.candles.length - 1].close : inst.price;
  const open = prevClose;
  const close = Math.max(0.001, open + randomStep(open));
  const high = Math.max(open, close) + Math.abs(randomStep(open));
  const low = Math.min(open, close) - Math.abs(randomStep(open));
  const candle = {
    symbol,
    time: Math.floor(Date.now() / 1000),
    open: Number(open.toFixed(5)),
    high: Number(high.toFixed(5)),
    low: Number(low.toFixed(5)),
    close: Number(close.toFixed(5))
  };
  inst.candles.push(candle);
  inst.price = close;
  if (inst.candles.length > 600) inst.candles.shift();
  return candle;
}

function detectSetup(symbol) {
  const inst = state[symbol];
  const c = inst.candles;
  if (c.length < 4) return null;

  const [a, b, d, e] = c.slice(-4);
  const bodyD = Math.abs(d.close - d.open);
  const rangeD = d.high - d.low || 1;
  const now = Date.now();
  if (now - inst.lastSetupAt < timeframeSec * 1000 * 2) return null;

  let setup = null;
  if (e.high > d.high && e.close < d.close) {
    setup = { setup: 'MSS', bias: 'SHORT', note: 'Market structure shift: sweep above and close lower' };
  } else if (e.low < d.low && e.close > d.close) {
    setup = { setup: 'SMC', bias: 'LONG', note: 'SMC liquidity sweep below and reclaim' };
  } else if (bodyD > rangeD * 0.65) {
    setup = {
      setup: 'Order Block',
      bias: d.close > d.open ? 'LONG' : 'SHORT',
      note: 'Large impulsive candle suggests order block zone'
    };
  } else if (d.low > b.high || d.high < b.low) {
    setup = {
      setup: 'FVG',
      bias: d.low > b.high ? 'LONG' : 'SHORT',
      note: 'Fair Value Gap detected on 3-candle imbalance'
    };
  } else if ((a.close < a.open && b.close > b.open && e.close > d.high)
    || (a.close > a.open && b.close < b.open && e.close < d.low)) {
    setup = {
      setup: 'ICT',
      bias: e.close > d.high ? 'LONG' : 'SHORT',
      note: 'ICT displacement + continuation confirmation'
    };
  }

  if (!setup) return null;
  inst.lastSetupAt = now;
  return { symbol, time: Math.floor(now / 1000), price: e.close, ...setup };
}

function emitSSE(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => res.write(line));
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const type = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/bootstrap') {
    sendJson(res, 200, {
      instruments: Object.entries(state).map(([symbol, inst]) => ({
        symbol,
        type: inst.type,
        candles: inst.candles
      }))
    });
    return;
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache'
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  serveStatic(req, res, url.pathname);
});

setInterval(() => {
  Object.keys(state).forEach((symbol) => {
    const candle = makeCandle(symbol);
    emitSSE({ type: 'candle', candle });
    const setup = detectSetup(symbol);
    if (setup) emitSSE({ type: 'setup', setup });
  });
}, timeframeSec * 1000);

for (let i = 0; i < 80; i += 1) {
  Object.keys(state).forEach((symbol) => makeCandle(symbol));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SMC terminal running at http://localhost:${PORT}`);
});
