const { WebSocketServer } = require("ws");

function attachChessServer(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  let chessWaiting = null;   // Chess queue
  let tetrixWaiting = null;  // Tetrix queue

  wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch { return; }

      // ====== CHESS ======
      if (data.type === "join_queue") {
        if (!chessWaiting) {
          chessWaiting = ws;
          ws._game = "chess";
          ws.send(JSON.stringify({ type: "queue_status", status: "waiting" }));
        } else {
          const other = chessWaiting;
          chessWaiting = null;
          const matchId = Date.now().toString();
          ws._matchId = matchId;  other._matchId = matchId;
          ws._opponent = other;   other._opponent = ws;
          ws._game = "chess";     other._game = "chess";
          ws.send(JSON.stringify({ type: "match_found", matchId, color: "white", opponentName: other._username || "Opponent" }));
          other.send(JSON.stringify({ type: "match_found", matchId, color: "black", opponentName: ws._username || "Opponent" }));
        }
      }

      if (data.type === "move" && ws._opponent && ws._matchId === data.matchId) {
        ws._opponent.send(JSON.stringify({ type: "opponent_move", move: data.move }));
      }

      // ====== TETRIX ======
      if (data.type === "tetrix_join") {
        ws._username = data.username || "Player";
        ws._avatar   = data.avatar  || "🎮";

        if (!tetrixWaiting) {
          tetrixWaiting = ws;
          ws._game = "tetrix";
          ws.send(JSON.stringify({ type: "tetrix_queuestatus", status: "waiting" }));
        } else {
          const other = tetrixWaiting;
          tetrixWaiting = null;
          const matchId = "tx_" + Date.now().toString();
          ws._matchId    = matchId;  other._matchId    = matchId;
          ws._opponent   = other;    other._opponent   = ws;
          ws._game       = "tetrix"; other._game       = "tetrix";
          ws.send(JSON.stringify({
            type: "tetrix_matchfound",
            matchId,
            opponentName: other._username,
            opponentAvatar: other._avatar
          }));
          other.send(JSON.stringify({
            type: "tetrix_matchfound",
            matchId,
            opponentName: ws._username,
            opponentAvatar: ws._avatar
          }));
        }
      }

      // Relay board state to opponent
      if (data.type === "tetrix_board" && ws._opponent && ws._matchId === data.matchId) {
        ws._opponent.send(JSON.stringify({
          type: "tetrix_board",
          board: data.board,
          boardColors: data.boardColors
        }));
      }

      // Relay garbage lines to opponent
      if (data.type === "tetrix_garbage" && ws._opponent && ws._matchId === data.matchId) {
        ws._opponent.send(JSON.stringify({
          type: "tetrix_garbage",
          lines: data.lines
        }));
      }

      // Relay top-out (loss) to opponent
      if (data.type === "tetrix_topout" && ws._opponent && ws._matchId === data.matchId) {
        ws._opponent.send(JSON.stringify({ type: "tetrix_topout" }));
      }
    });

    ws.on("close", () => {
      // Clean up queues
      if (chessWaiting  === ws) chessWaiting  = null;
      if (tetrixWaiting === ws) tetrixWaiting = null;

      // Notify opponent
      if (ws._opponent) {
        const disconnectType = ws._game === "tetrix"
          ? "tetrix_opponentdisconnect"
          : "opponent_disconnected";
        try {
          ws._opponent.send(JSON.stringify({ type: disconnectType }));
        } catch {}
        ws._opponent._opponent = null;
        ws._opponent = null;
      }
    });
  });
}

module.exports = attachChessServer;