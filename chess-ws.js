const { WebSocketServer } = require("ws");

function attachChessServer(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  let waitingClient = null;

  wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch { return; }

      if (data.type === "join_queue") {
        if (!waitingClient) {
          waitingClient = ws;
          ws.send(JSON.stringify({ type: "queue_status", status: "waiting" }));
        } else {
          const other = waitingClient;
          waitingClient = null;

          const matchId = Date.now().toString();
          ws._matchId = matchId;
          other._matchId = matchId;
          ws._opponent = other;
          other._opponent = ws;

          ws.send(JSON.stringify({ type: "match_found", matchId, color: "white" }));
          other.send(JSON.stringify({ type: "match_found", matchId, color: "black" }));
        }
      }

      if (data.type === "move" && ws._opponent && ws._matchId === data.matchId) {
        ws._opponent.send(JSON.stringify({ type: "opponent_move", move: data.move }));
      }
    });

    ws.on("close", () => {
      if (waitingClient === ws) waitingClient = null;
      if (ws._opponent) {
        try {
          ws._opponent.send(JSON.stringify({ type: "opponent_disconnected" }));
        } catch {}
        ws._opponent = null;
      }
    });
  });
}

module.exports = attachChessServer;
