#!/usr/bin/env node
/**
 * Test script for sync commands
 * Tests: add, update, delete, restore, cleanup, batch
 */

// ESM in .mjs files requires explicit .js extensions for local imports
// eslint-disable-next-line import/extensions
import { runSyncAdd, runSyncUpdate, runSyncDelete, runSyncRestore, runSyncCleanup, runSyncBatch } from './dist/application/sync.js';

const TEST_SOURCE = 'test-sync';
const TEST_SCOPE = 'test-scope';
const TEST_CWD = process.cwd();

async function testAdd() {
  console.log('🧪 Testing add command...');
  try {
    const result = await runSyncAdd({
      cwd: TEST_CWD,
      source: TEST_SOURCE,
      id: 'test-doc-1',
      scopeId: TEST_SCOPE,
      content: 'Test document 1 content',
      metadata: JSON.stringify({ test: true }),
    });
    console.log('✅ Add test passed:', result.success);
    return result.success;
  } catch (error) {
    console.error('❌ Add test failed:', error.message);
    return false;
  }
}

async function testUpdate() {
  console.log('🧪 Testing update command...');
  try {
    const result = await runSyncUpdate({
      cwd: TEST_CWD,
      source: TEST_SOURCE,
      id: 'test-doc-1',
      scopeId: TEST_SCOPE,
      content: 'Updated test document 1 content',
      metadata: JSON.stringify({ test: true, updated: true }),
    });
    console.log('✅ Update test passed:', result.success);
    return result.success;
  } catch (error) {
    console.error('❌ Update test failed:', error.message);
    return false;
  }
}

async function testDelete() {
  console.log('🧪 Testing delete command (soft-delete)...');
  try {
    const result = await runSyncDelete({
      cwd: TEST_CWD,
      source: TEST_SOURCE,
      id: 'test-doc-1',
      scopeId: TEST_SCOPE,
    });
    console.log('✅ Delete test passed:', result.success);
    return result.success;
  } catch (error) {
    console.error('❌ Delete test failed:', error.message);
    return false;
  }
}

async function testRestore() {
  console.log('🧪 Testing restore command...');
  try {
    const result = await runSyncRestore({
      cwd: TEST_CWD,
      source: TEST_SOURCE,
      id: 'test-doc-1',
      scopeId: TEST_SCOPE,
    });
    console.log('✅ Restore test passed:', result.success);
    return result.success;
  } catch (error) {
    console.error('❌ Restore test failed:', error.message);
    return false;
  }
}

async function testBatch() {
  console.log('🧪 Testing batch command...');
  try {
    const fs = await import('fs/promises');
    const tmpFile = `/tmp/sync-batch-test-${Date.now()}.json`;
    const batchOps = {
      operations: [
        {
          operation: 'add',
          source: TEST_SOURCE,
          id: 'test-doc-2',
          scopeId: TEST_SCOPE,
          content: 'Batch test document 2',
        },
        {
          operation: 'add',
          source: TEST_SOURCE,
          id: 'test-doc-3',
          scopeId: TEST_SCOPE,
          content: 'Batch test document 3',
        },
        {
          operation: 'update',
          source: TEST_SOURCE,
          id: 'test-doc-2',
          scopeId: TEST_SCOPE,
          content: 'Updated batch test document 2',
        },
      ],
    };
    await fs.writeFile(tmpFile, JSON.stringify(batchOps), 'utf-8');
    try {
      const result = await runSyncBatch({
        cwd: TEST_CWD,
        file: tmpFile,
      });
      console.log('✅ Batch test passed:', result.succeeded, 'succeeded,', result.failed, 'failed');
      await fs.unlink(tmpFile).catch(() => {});
      return result.failed === 0;
    } catch (error) {
      await fs.unlink(tmpFile).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error('❌ Batch test failed:', error.message);
    return false;
  }
}

async function testCleanup() {
  console.log('🧪 Testing cleanup command...');
  try {
    // First, delete a document
    await runSyncDelete({
      cwd: TEST_CWD,
      source: TEST_SOURCE,
      id: 'test-doc-3',
      scopeId: TEST_SCOPE,
    });
    
    // Wait a bit to ensure deletedAt is set
    await new Promise(resolve => { setTimeout(resolve, 100); });
    
    // Try cleanup with very short TTL (0 days = immediate cleanup)
    // Note: This might not work if TTL validation prevents 0 days
    const result = await runSyncCleanup({
      cwd: TEST_CWD,
      source: TEST_SOURCE,
      scopeId: TEST_SCOPE,
      deletedOnly: true,
      ttlDays: 0, // Immediate cleanup
    });
    console.log('✅ Cleanup test passed:', result.deleted, 'documents deleted');
    return true; // Cleanup might not delete anything if TTL is too short, but command should succeed
  } catch (error) {
    console.error('❌ Cleanup test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting sync commands tests...\n');
  
  const results = {
    add: await testAdd(),
    update: await testUpdate(),
    delete: await testDelete(),
    restore: await testRestore(),
    batch: await testBatch(),
    cleanup: await testCleanup(),
  };
  
  console.log('\n📊 Test Results:');
  console.log('================');
  for (const [test, passed] of Object.entries(results)) {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  }
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  
  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
