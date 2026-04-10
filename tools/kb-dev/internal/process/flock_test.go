package process

import (
	"testing"
	"time"
)

func TestAcquireAndRelease(t *testing.T) {
	dir := t.TempDir()

	lock, err := AcquireLock(dir)
	if err != nil {
		t.Fatalf("AcquireLock() error: %v", err)
	}

	lock.Release()
}

func TestTryLockSuccess(t *testing.T) {
	dir := t.TempDir()

	lock, err := TryLock(dir)
	if err != nil {
		t.Fatalf("TryLock() error: %v", err)
	}
	if lock == nil {
		t.Fatal("TryLock() should succeed on uncontested lock")
	}

	lock.Release()
}

func TestTryLockContested(t *testing.T) {
	dir := t.TempDir()

	// Acquire the lock.
	lock1, err := AcquireLock(dir)
	if err != nil {
		t.Fatalf("AcquireLock() error: %v", err)
	}
	defer lock1.Release()

	// Try to acquire again — should return nil (not block).
	lock2, err := TryLock(dir)
	if err != nil {
		t.Fatalf("TryLock() error: %v", err)
	}
	if lock2 != nil {
		lock2.Release()
		t.Fatal("TryLock() should return nil when lock is held")
	}
}

func TestAcquireTimeout(t *testing.T) {
	dir := t.TempDir()

	// Hold the lock.
	lock1, err := AcquireLock(dir)
	if err != nil {
		t.Fatalf("AcquireLock() error: %v", err)
	}
	defer lock1.Release()

	// Try to acquire with very short timeout — should fail.
	start := time.Now()
	_, err = AcquireLockTimeout(dir, 1*time.Second)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("AcquireLockTimeout() should fail when lock is held")
	}
	if elapsed < 900*time.Millisecond {
		t.Errorf("should wait ~1s, waited %v", elapsed)
	}
	if elapsed > 3*time.Second {
		t.Errorf("should timeout around 1s, waited %v", elapsed)
	}
}

func TestAcquireAfterRelease(t *testing.T) {
	dir := t.TempDir()

	// Acquire and release.
	lock1, err := AcquireLock(dir)
	if err != nil {
		t.Fatalf("first AcquireLock() error: %v", err)
	}
	lock1.Release()

	// Should succeed immediately.
	lock2, err := AcquireLock(dir)
	if err != nil {
		t.Fatalf("second AcquireLock() error: %v", err)
	}
	lock2.Release()
}

func TestReleaseIdempotent(t *testing.T) {
	dir := t.TempDir()

	lock, err := AcquireLock(dir)
	if err != nil {
		t.Fatalf("AcquireLock() error: %v", err)
	}

	// Double release should not panic.
	lock.Release()
	lock.Release()
}
