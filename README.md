# SMC Auto Setup Terminal

A full-stack realtime web app that streams synthetic forex and commodity candles and highlights only these setup families:

- MSS (Market Structure Shift)
- SMC liquidity sweep reclaim
- ICT displacement/continuation
- Order Block impulse zone
- FVG (Fair Value Gap)

## Features

- Terminal-style dark UI with live candlestick chart (Lightweight Charts)
- Forex + commodities instrument selector
- SSE realtime candle stream
- Setup-only signal feed and browser notifications
- Long/Short auto-trade templates (arm one click)
- Realtime backtest-style stats (wins/losses/win-rate) from armed template execution

## Stack

- Backend: Node.js built-in `http` + Server-Sent Events
- Frontend: Vanilla JS + Lightweight Charts

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Notes

- This starter uses synthetic candle generation so you can build and validate workflows immediately.
- To go production, replace candle generation with a broker/data provider SSE/WebSocket feed and tighten setup rules per your exact strategy.
