package main

import (
	"embed"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"log"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app := NewApp()
	if err := wails.Run(&options.App{Title: "wadahdb-studio", Width: 1440, Height: 960, MinWidth: 1000, MinHeight: 700, AssetServer: &assetserver.Options{Assets: assets}, OnStartup: app.startup, OnShutdown: app.shutdown, Bind: []interface{}{app}}); err != nil {
		log.Fatal(err)
	}
}
