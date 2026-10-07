package main

import (
	"embed"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"log"
)

//go:embed all:dist
var assets embed.FS

//go:embed build/icons/wadahdb-studio.png
var appIcon []byte

func main() {
	app := NewApp()
	// Preserve Wails' default GPU policy when supplying Linux options for the icon.
	linuxOptions := &linux.Options{Icon: appIcon, WebviewGpuPolicy: linux.WebviewGpuPolicyNever}
	if err := wails.Run(&options.App{Title: "wadahdb-studio", Width: 1440, Height: 960, MinWidth: 1000, MinHeight: 700, Linux: linuxOptions, AssetServer: &assetserver.Options{Assets: assets}, OnStartup: app.startup, OnShutdown: app.shutdown, Bind: []interface{}{app}}); err != nil {
		log.Fatal(err)
	}
}
