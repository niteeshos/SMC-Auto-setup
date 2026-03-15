const chartContainer = document.getElementById('chart');
const instrumentSelect = document.getElementById('instrumentSelect');
const signalFeed = document.getElementById('signalFeed');
const connStatus = document.getElementById('connStatus');
const armedState = document.getElementById('armedState');

const totalTradesEl = document.getElementById('totalTrades');
const winsEl = document.getElementById('wins');
const lossesEl = document.getElementById('losses');
const winRateEl = document.getElementById('winRate');

const chart = LightweightCharts.createChart(chartContainer, {
  layout: { background: { color: '#0f172a' }, textColor: '#cbd5e1' },
  grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
  rightPriceScale: { borderColor: '#334155' },
  timeScale: { borderColor: '#334155' }
});
const candleSeries = chart.addCandlestickSeries({
  upColor: '#22c55e',
  downColor: '#ef4444',
  borderDownColor: '#ef4444',
  borderUpColor: '#22c55e',
  wickDownColor: '#ef4444',
  wickUpColor: '#22c55e'
});

const instruments = {};
let selectedSymbol = null;
let armedBias = null;

const stats = {
  total: 0,
  wins: 0,
  losses: 0
};
const openTrades = [];

function renderStats() {
  totalTradesEl.textContent = stats.total;
  winsEl.textContent = stats.wins;
  lossesEl.textContent = stats.losses;
  const rate = stats.total ? ((stats.wins / stats.total) * 100).toFixed(1) : '0';
  winRateEl.textContent = `${rate}%`;
}

function notify(setup) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`${setup.symbol} ${setup.setup} ${setup.bias}`, {
      body: `Price ${setup.price} — ${setup.note}`
    });
  }
}

function addSignal(setup) {
  const item = document.createElement('li');
  item.className = setup.bias.toLowerCase();
  const t = new Date(setup.time * 1000).toLocaleTimeString();
  item.innerHTML = `<strong>${setup.symbol} · ${setup.setup} · ${setup.bias}</strong><br>${setup.note}<br><span class="muted">${t} @ ${setup.price}</span>`;
  signalFeed.prepend(item);
  while (signalFeed.children.length > 35) {
    signalFeed.removeChild(signalFeed.lastChild);
  }
}

function maybeArmTrade(setup) {
  if (!armedBias || armedBias !== setup.bias || setup.symbol !== selectedSymbol) {
    return;
  }
  const entry = setup.price;
  const risk = entry * 0.0015;
  const trade = {
    symbol: setup.symbol,
    bias: setup.bias,
    entry,
    stop: setup.bias === 'LONG' ? entry - risk : entry + risk,
    target: setup.bias === 'LONG' ? entry + risk * 2 : entry - risk * 2,
    closed: false
  };
  openTrades.push(trade);
  stats.total += 1;
  renderStats();
}

function evaluateOpenTrades(candle) {
  openTrades.forEach((trade) => {
    if (trade.closed || trade.symbol !== candle.symbol) {
      return;
    }
    const hitTarget = trade.bias === 'LONG' ? candle.high >= trade.target : candle.low <= trade.target;
    const hitStop = trade.bias === 'LONG' ? candle.low <= trade.stop : candle.high >= trade.stop;
    if (hitTarget) {
      trade.closed = true;
      stats.wins += 1;
    } else if (hitStop) {
      trade.closed = true;
      stats.losses += 1;
    }
  });
  renderStats();
}

function setSelectedSymbol(symbol) {
  selectedSymbol = symbol;
  candleSeries.setData(instruments[symbol]?.candles || []);
}

async function init() {
  const bootstrap = await fetch('/api/bootstrap').then((r) => r.json());
  bootstrap.instruments.forEach((inst) => {
    instruments[inst.symbol] = { candles: inst.candles, type: inst.type };
    const option = document.createElement('option');
    option.value = inst.symbol;
    option.textContent = `${inst.symbol} (${inst.type})`;
    instrumentSelect.appendChild(option);
  });
  if (!selectedSymbol && bootstrap.instruments.length) {
    setSelectedSymbol(bootstrap.instruments[0].symbol);
    instrumentSelect.value = bootstrap.instruments[0].symbol;
  }

  const stream = new EventSource('/api/stream');
  stream.onopen = () => {
    connStatus.textContent = 'Live';
    connStatus.style.color = '#22c55e';
  };

  stream.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'candle') {
      const { candle } = msg;
      instruments[candle.symbol].candles.push(candle);
      if (instruments[candle.symbol].candles.length > 600) {
        instruments[candle.symbol].candles.shift();
      }
      if (candle.symbol === selectedSymbol) {
        candleSeries.update(candle);
      }
      evaluateOpenTrades(candle);
    }

    if (msg.type === 'setup') {
      addSignal(msg.setup);
      notify(msg.setup);
      maybeArmTrade(msg.setup);
    }
  };

  stream.onerror = () => {
    connStatus.textContent = 'Reconnecting...';
    connStatus.style.color = '#f59e0b';
  };
}

instrumentSelect.addEventListener('change', (event) => {
  setSelectedSymbol(event.target.value);
});

document.querySelectorAll('.tpl').forEach((btn) => {
  btn.addEventListener('click', () => {
    armedBias = btn.dataset.bias;
    armedState.textContent = `Armed ${armedBias} template — next matching ${armedBias} setup on ${selectedSymbol} will auto-enter`;
  });
});

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

window.addEventListener('resize', () => {
  chart.applyOptions({ width: chartContainer.clientWidth });
});
chart.applyOptions({ width: chartContainer.clientWidth });
renderStats();

init();
