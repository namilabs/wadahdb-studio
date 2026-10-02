package main

import (
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type DialogOptions struct {
	Title       string `json:"title"`
	DefaultPath string `json:"defaultPath"`
	Filters     []struct {
		Name       string   `json:"name"`
		Extensions []string `json:"extensions"`
	} `json:"filters"`
}

func dialogFilters(o DialogOptions) []runtime.FileFilter {
	f := []runtime.FileFilter{}
	for _, v := range o.Filters {
		parts := []string{}
		for _, x := range v.Extensions {
			parts = append(parts, "*."+x)
		}
		f = append(f, runtime.FileFilter{DisplayName: v.Name, Pattern: strings.Join(parts, ";")})
	}
	return f
}
func (a *App) OpenFile(o DialogOptions) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: o.Title, Filters: dialogFilters(o)})
}
func (a *App) SaveFile(o DialogOptions) (string, error) {
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: o.Title, DefaultFilename: o.DefaultPath, Filters: dialogFilters(o)})
}
