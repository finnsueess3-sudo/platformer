const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 8080 });

let players = {};

function newPlayer() {
    return { x: 100, y: 320, vx: 0, vy: 0, grounded: true };
}

server.on("connection", (ws) => {
    const id = Math.random().toString(36).slice(2, 8);
    players[id] = newPlayer();

    ws.send(JSON.stringify({ type:"init", id }));

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        const p = players[id];
        if (!p) return;

        if (data.type === "input") {
            const speed = 4;

            if (data.left)  p.x -= speed;
            if (data.right) p.x += speed;

            // simple gravity
            p.y += 4;
            if (p.y > 320) p.y = 320;

            if (data.jump && p.y >= 320) {
                p.y -= 50;
            }
        }
    });

    ws.on("close", () => {
        delete players[id];
    });
});

// Broadcast game state 20×/s
setInterval(() => {
    const state = JSON.stringify({ type:"state", players });
    server.clients.forEach(c => { if (c.readyState === 1) c.send(state); });
}, 50);

console.log("Server läuft auf ws://localhost:8080");
