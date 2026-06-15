package sheetcompressor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// corpusRoot resolves <repo>/fixtures/corpus from this file's location, so
// `go test ./...` works regardless of the caller's cwd.
func corpusRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed; cannot locate fixtures/")
	}
	// .../packages/go/sheetcompressor/conformance_test.go → up 4 → repo root.
	root := filepath.Join(filepath.Dir(file), "..", "..", "..", "fixtures", "corpus")
	abs, err := filepath.Abs(root)
	if err != nil {
		t.Fatalf("filepath.Abs(%q): %v", root, err)
	}
	if _, err := os.Stat(abs); err != nil {
		t.Fatalf("fixtures dir %s not found: %v", abs, err)
	}
	return abs
}

func loadFixtureIDs(t *testing.T, root string) []string {
	t.Helper()
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read corpus dir %s: %v", root, err)
	}
	var ids []string
	for _, e := range entries {
		if e.IsDir() {
			ids = append(ids, e.Name())
		}
	}
	sort.Strings(ids)
	return ids
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

func TestConformance(t *testing.T) {
	root := corpusRoot(t)
	ids := loadFixtureIDs(t, root)
	if len(ids) == 0 {
		t.Fatal("no fixtures found under " + root)
	}

	for _, id := range ids {
		id := id
		t.Run(id, func(t *testing.T) {
			fixtureDir := filepath.Join(root, id)
			goldenDir := filepath.Join(fixtureDir, "golden")

			raw, err := os.ReadFile(filepath.Join(fixtureDir, "input.json"))
			if err != nil {
				t.Fatalf("read input.json: %v", err)
			}
			var grid Grid
			if err := json.Unmarshal(raw, &grid); err != nil {
				t.Fatalf("parse input.json: %v", err)
			}

			result := Compress(&grid, Options{})

			// anchor.string.txt — no trailing newline.
			compareString(t, "anchor.string", result.Anchor.String,
				readFile(t, filepath.Join(goldenDir, "anchor.string.txt")))

			// anchor.json — 2-space indent + trailing "\n".
			compareJSON(t, "anchor.json", result.Anchor.JSON,
				readFile(t, filepath.Join(goldenDir, "anchor.json")))

			// anchor.tokenEstimate — single integer + trailing "\n".
			compareTokens(t, "anchor.tokenEstimate", result.Anchor.TokenEstimate,
				readFile(t, filepath.Join(goldenDir, "anchor.tokenEstimate.txt")))

			compareString(t, "invertedIndex.string", result.InvertedIndex.String,
				readFile(t, filepath.Join(goldenDir, "invertedIndex.string.txt")))
			compareJSON(t, "invertedIndex.json", result.InvertedIndex.JSON,
				readFile(t, filepath.Join(goldenDir, "invertedIndex.json")))
			compareTokens(t, "invertedIndex.tokenEstimate", result.InvertedIndex.TokenEstimate,
				readFile(t, filepath.Join(goldenDir, "invertedIndex.tokenEstimate.txt")))

			compareString(t, "formatAggregation.string", result.FormatAggregation.String,
				readFile(t, filepath.Join(goldenDir, "formatAggregation.string.txt")))
			compareJSON(t, "formatAggregation.json", result.FormatAggregation.JSON,
				readFile(t, filepath.Join(goldenDir, "formatAggregation.json")))
			compareTokens(t, "formatAggregation.tokenEstimate", result.FormatAggregation.TokenEstimate,
				readFile(t, filepath.Join(goldenDir, "formatAggregation.tokenEstimate.txt")))

			compareTokens(t, "rawBaseline.tokenEstimate", result.RawBaseline.TokenEstimate,
				readFile(t, filepath.Join(goldenDir, "rawBaseline.tokenEstimate.txt")))

			compareJSON(t, "charts.json", result.Charts,
				readFile(t, filepath.Join(goldenDir, "charts.json")))
		})
	}
}

func compareString(t *testing.T, label, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("%s mismatch\n--- got ---\n%s\n--- want ---\n%s", label, got, want)
	}
}

func compareJSON(t *testing.T, label string, v any, want string) {
	t.Helper()
	got, err := MarshalGoldenJSON(v)
	if err != nil {
		t.Fatalf("%s marshal: %v", label, err)
	}
	if string(got) != want {
		t.Errorf("%s mismatch\n--- got ---\n%s\n--- want ---\n%s", label, string(got), want)
	}
}

func compareTokens(t *testing.T, label string, got int, want string) {
	t.Helper()
	wantTrim := strings.TrimRight(want, "\n")
	parsed, err := strconv.Atoi(wantTrim)
	if err != nil {
		t.Fatalf("%s: parse expected %q: %v", label, wantTrim, err)
	}
	if got != parsed {
		t.Errorf("%s mismatch: got %d, want %d", label, got, parsed)
	}
	// Also pin the trailing-newline + integer format.
	if fmt.Sprintf("%d\n", got) != want {
		t.Errorf("%s formatting mismatch: got %q, want %q",
			label, fmt.Sprintf("%d\n", got), want)
	}
}
