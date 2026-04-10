package scaffold

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/devkit/internal/config"
)

func resolveURL(tmpl config.ScaffoldTemplate) (fs.FS, func(), error) {
	if tmpl.URL == "" {
		return nil, noop, fmt.Errorf("url template requires a url")
	}

	tmp, err := os.MkdirTemp("", "kb-devkit-scaffold-*")
	if err != nil {
		return nil, noop, fmt.Errorf("create temp dir: %w", err)
	}
	cleanup := func() { os.RemoveAll(tmp) }

	resp, err := http.Get(tmpl.URL) //nolint:gosec // URL is from trusted devkit.yaml
	if err != nil {
		cleanup()
		return nil, noop, fmt.Errorf("fetch %q: %w", tmpl.URL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		cleanup()
		return nil, noop, fmt.Errorf("fetch %q: HTTP %d", tmpl.URL, resp.StatusCode)
	}

	u := strings.ToLower(tmpl.URL)
	switch {
	case strings.HasSuffix(u, ".zip"):
		if err := extractZip(resp.Body, tmp); err != nil {
			cleanup()
			return nil, noop, err
		}
	case strings.HasSuffix(u, ".tar.gz") || strings.HasSuffix(u, ".tgz"):
		if err := extractTarGz(resp.Body, tmp); err != nil {
			cleanup()
			return nil, noop, err
		}
	default:
		cleanup()
		return nil, noop, fmt.Errorf("unsupported archive format for %q (want .zip, .tar.gz, .tgz)", tmpl.URL)
	}

	return os.DirFS(tmp), cleanup, nil
}

func extractZip(r io.Reader, dest string) error {
	// zip.NewReader requires io.ReaderAt — buffer to temp file first.
	tmp, err := os.CreateTemp("", "kb-devkit-zip-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	size, err := io.Copy(tmp, r)
	if err != nil {
		return fmt.Errorf("buffer zip: %w", err)
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}

	for _, f := range zr.File {
		target := filepath.Join(dest, filepath.FromSlash(f.Name)) //nolint:gosec
		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0o755) //nolint:errcheck
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(target)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc) //nolint:gosec
		rc.Close()
		out.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func extractTarGz(r io.Reader, dest string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar: %w", err)
		}
		target := filepath.Join(dest, filepath.FromSlash(hdr.Name)) //nolint:gosec
		switch hdr.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(target, 0o755) //nolint:errcheck
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.Create(target)
			if err != nil {
				return err
			}
			_, err = io.Copy(out, tr) //nolint:gosec
			out.Close()
			if err != nil {
				return err
			}
		}
	}
	return nil
}
