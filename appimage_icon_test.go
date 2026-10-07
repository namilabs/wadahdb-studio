package main

import (
	"image/png"
	"os"
	"testing"
)

func TestAppImageIconDimensions(t *testing.T) {
	f, err := os.Open("build/icons/wadahdb-studio-256.png")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	config, err := png.DecodeConfig(f)
	if err != nil {
		t.Fatal(err)
	}
	// Match the hicolor/256x256 destination and linuxdeploy's supported sizes.
	if config.Width != 256 || config.Height != 256 {
		t.Fatalf("AppImage icon must be 256x256, got %dx%d", config.Width, config.Height)
	}
}
