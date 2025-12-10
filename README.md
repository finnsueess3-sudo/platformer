# Web Platform Fighter — Minimal Prototype

Dieses Repo enthält einen minimalen **2D Platform-Fighter** Prototyp mit:
- HTML5 Canvas Client (index.html)
- Node.js Authoritative WebSocket Server (server.js)
- Features: Movement, Jump, Dash, Projectile, Ultimate (Charge), Plattformen, Hitboxes
- Networking: Client Prediction + Server Authoritative Snapshot + Basic Reconciliation

## Dateien
- `index.html` — Client (öffnen im Browser)
- `server.js` — Node.js WebSocket Server

## Voraussetzungen
- Node.js (14+)
- `ws` WebSocket-Bibliothek

## Installation & Start
```bash
# 1) Repo initialisieren (falls neu)
npm init -y
npm install ws

# 2) Server starten
node server.js

# 3) Client öffnen
# Einfach index.html im Browser öffnen oder per einfachem HTTP-Server:
python -m http.server 8000
# Dann im Browser: http://localhost:8000/index.html
