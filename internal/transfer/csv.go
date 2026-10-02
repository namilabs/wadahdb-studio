package transfer

import (
	"encoding/csv"
	"io"
	"os"

	"wadahdb-studio/internal/model"
)

func PreviewCsv(path string) (model.CsvPreview, error) {
	out := model.CsvPreview{Rows: [][]string{}}
	f, e := os.Open(path)
	if e != nil {
		return out, e
	}
	defer f.Close()
	r := csv.NewReader(f)
	out.Headers, e = r.Read()
	if e != nil {
		return out, e
	}
	for i := 0; i < 10; i++ {
		v, e := r.Read()
		if e == io.EOF {
			break
		}
		if e != nil {
			return out, e
		}
		out.Rows = append(out.Rows, v)
	}
	return out, nil
}
