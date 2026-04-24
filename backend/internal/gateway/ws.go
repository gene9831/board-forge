package gateway

import (
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gene9831/board-forge/internal/game"
	"github.com/gene9831/board-forge/internal/manager"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(req *http.Request) bool {
		return true // demo; restrict in production
	},
}

// wsSink serializes WriteJSON per connection.
type wsSink struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (sink *wsSink) WriteJSON(payload any) error {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	return sink.conn.WriteJSON(payload)
}

// Handler serves WebSocket game traffic at /ws/{roomID}.
type Handler struct {
	Mgr *manager.Manager
}

// Register mounts HTTP routes on mux.
func (handler *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /ws/", handler.handleWS)
	mux.HandleFunc("GET /healthz", func(resp http.ResponseWriter, _ *http.Request) {
		resp.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = resp.Write([]byte("ok"))
	})
}

func (handler *Handler) handleWS(resp http.ResponseWriter, req *http.Request) {
	roomID := strings.TrimPrefix(req.URL.Path, "/ws/")
	roomID = strings.Trim(roomID, "/")
	if roomID == "" {
		http.Error(resp, "room id required: /ws/{roomId}", http.StatusBadRequest)
		return
	}
	if strings.Contains(roomID, "/") {
		http.Error(resp, "bad request: path must be exactly /ws/{roomId}", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(resp, req, nil)
	if err != nil {
		slog.Warn("ws upgrade failed", "err", err)
		return
	}
	defer conn.Close()

	gameRoom := handler.Mgr.GetOrCreate(roomID)
	if gameRoom == nil {
		msg := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "room initialization failed")
		_ = conn.WriteControl(websocket.CloseMessage, msg, time.Now().Add(time.Second))
		slog.Warn("ws rejected: room init", "room", roomID)
		return
	}
	clientSink := &wsSink{conn: conn}

	var (
		registered bool
		playerID   string
	)

	for {
		var action game.Action
		if err := conn.ReadJSON(&action); err != nil {
			if registered {
				gameRoom.RemoveClient(playerID)
			}
			return
		}

		if action.PlayerID != "" && !registered {
			registered = true
			playerID = action.PlayerID
			gameRoom.AddClient(playerID, clientSink)
		}

		gameRoom.Enqueue(action)
	}
}
