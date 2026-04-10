package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// expandEnv performs ${VAR} substitution on all string fields of a yamlFile.
// Values are resolved from two sources, in priority order:
//
//  1. The process environment (os.Getenv).
//  2. A .env file loaded from rootDir (if present; silently skipped if missing).
//
// Any reference to an undefined variable is a hard error so that services do
// not start with silently-broken configuration.
func expandEnv(yf *yamlFile, rootDir string) error {
	dotenv, err := loadDotEnv(filepath.Join(rootDir, ".env"))
	if err != nil {
		return fmt.Errorf("load .env: %w", err)
	}

	lookup := func(key string) (string, bool) {
		if v, ok := os.LookupEnv(key); ok {
			return v, true
		}
		if v, ok := dotenv[key]; ok {
			return v, true
		}
		return "", false
	}

	expand := func(field, context string) (string, error) {
		return expandString(field, context, lookup)
	}

	yf.Name, err = expand(yf.Name, "name")
	if err != nil {
		return err
	}

	for id, svc := range yf.Services {
		ctx := fmt.Sprintf("service %q", id)

		svc.Command, err = expand(svc.Command, ctx+".command")
		if err != nil {
			return err
		}
		svc.StopCommand, err = expand(svc.StopCommand, ctx+".stop_command")
		if err != nil {
			return err
		}
		svc.HealthCheck, err = expand(svc.HealthCheck, ctx+".health_check")
		if err != nil {
			return err
		}
		svc.URL, err = expand(svc.URL, ctx+".url")
		if err != nil {
			return err
		}
		svc.Container, err = expand(svc.Container, ctx+".container")
		if err != nil {
			return err
		}
		svc.Note, err = expand(svc.Note, ctx+".note")
		if err != nil {
			return err
		}

		expanded := make(map[string]string, len(svc.Env))
		for k, v := range svc.Env {
			v, err = expand(v, fmt.Sprintf("%s.env.%s", ctx, k))
			if err != nil {
				return err
			}
			expanded[k] = v
		}
		svc.Env = expanded

		yf.Services[id] = svc
	}

	return nil
}

// expandString replaces all ${VAR} references in s using the provided lookup
// function. Returns an error if any referenced variable is not found.
func expandString(s, context string, lookup func(string) (string, bool)) (string, error) {
	if !strings.Contains(s, "${") {
		return s, nil
	}

	var b strings.Builder
	rest := s

	for {
		start := strings.Index(rest, "${")
		if start == -1 {
			b.WriteString(rest)
			break
		}

		b.WriteString(rest[:start])
		rest = rest[start+2:]

		end := strings.Index(rest, "}")
		if end == -1 {
			// Unclosed brace — treat as literal and stop.
			b.WriteString("${")
			b.WriteString(rest)
			break
		}

		key := rest[:end]
		rest = rest[end+1:]

		val, ok := lookup(key)
		if !ok {
			return "", fmt.Errorf("%s: environment variable %q is not set", context, key)
		}
		b.WriteString(val)
	}

	return b.String(), nil
}

// loadDotEnv parses a .env file and returns key=value pairs.
// Blank lines and lines starting with # are ignored.
// Returns an empty map (no error) when the file does not exist.
func loadDotEnv(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()

	m := make(map[string]string)
	scanner := bufio.NewScanner(f)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())

		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		idx := strings.IndexByte(line, '=')
		if idx < 1 {
			return nil, fmt.Errorf("%s:%d: invalid line %q (want KEY=VALUE)", path, lineNum, line)
		}

		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])

		// Strip optional surrounding quotes (" or ').
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') ||
				(val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}

		m[key] = val
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return m, nil
}
