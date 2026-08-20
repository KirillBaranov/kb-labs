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

const (
	maxScaffoldArchiveBytes = 256 << 20
	maxScaffoldFileBytes    = 64 << 20
	maxScaffoldEntries      = 100_000
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

	size, err := io.Copy(tmp, io.LimitReader(r, maxScaffoldArchiveBytes+1))
	if err != nil {
		return fmt.Errorf("buffer zip: %w", err)
	}
	if size > maxScaffoldArchiveBytes {
		return fmt.Errorf("zip archive exceeds %d MiB limit", maxScaffoldArchiveBytes>>20)
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}

	if len(zr.File) > maxScaffoldEntries {
		return fmt.Errorf("zip archive contains too many entries (max %d)", maxScaffoldEntries)
	}
	for _, f := range zr.File {
		target, err := archiveTarget(dest, f.Name)
		if err != nil {
			return err
		}
		if f.UncompressedSize64 > maxScaffoldFileBytes {
			return fmt.Errorf("zip entry %q exceeds %d MiB limit", f.Name, maxScaffoldFileBytes>>20)
		}
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
		n, copyErr := io.Copy(out, io.LimitReader(rc, maxScaffoldFileBytes+1))
		rc.Close()
		out.Close()
		if copyErr != nil {
			return copyErr
		}
		if n > maxScaffoldFileBytes {
			return fmt.Errorf("zip entry %q exceeds %d MiB limit", f.Name, maxScaffoldFileBytes>>20)
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
	var entries int
	var totalBytes int64
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar: %w", err)
		}
		entries++
		if entries > maxScaffoldEntries {
			return fmt.Errorf("tar archive contains too many entries (max %d)", maxScaffoldEntries)
		}
		target, err := archiveTarget(dest, hdr.Name)
		if err != nil {
			return err
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(target, 0o755) //nolint:errcheck
		case tar.TypeReg:
			if hdr.Size > maxScaffoldFileBytes || totalBytes > maxScaffoldArchiveBytes-hdr.Size {
				return fmt.Errorf("tar archive exceeds extraction size limit")
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.Create(target)
			if err != nil {
				return err
			}
			written, copyErr := io.Copy(out, io.LimitReader(tr, hdr.Size))
			out.Close()
			if copyErr != nil {
				return copyErr
			}
			if written != hdr.Size {
				return fmt.Errorf("tar entry %q ended before declared size", hdr.Name)
			}
			totalBytes += written
		}
	}
	return nil
}

func archiveTarget(dest, name string) (string, error) {
	rel := filepath.Clean(filepath.FromSlash(name))
	if rel == "." || filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("archive entry escapes destination: %q", name)
	}
	return filepath.Join(dest, rel), nil
}
