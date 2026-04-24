package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gene9831/board-forge/internal/gateway"
	"github.com/gene9831/board-forge/internal/manager"
	"github.com/gene9831/board-forge/internal/version"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))

	addr := flag.String("addr", ":8080", "HTTP listen address")
	rulesFlag := flag.String("rules", "games/minimal/game.json", "path to game.json pack or rules.lua")
	flag.Parse()

	rulesPath := *rulesFlag
	if abs, err := filepath.Abs(rulesPath); err == nil {
		rulesPath = abs
	}
	if _, err := os.Stat(rulesPath); err != nil {
		slog.Error("rules / game pack not found", "path", rulesPath, "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	slog.InfoContext(ctx, "board-forge starting", "version", version.Version, "addr", *addr, "rules", rulesPath)

	mgr := manager.New(rulesPath)
	apiGateway := &gateway.Handler{Mgr: mgr}
	mux := http.NewServeMux()
	apiGateway.Register(mux)

	server := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Warn("graceful shutdown failed", "err", err)
	}
	slog.InfoContext(ctx, "shutting down")
}
