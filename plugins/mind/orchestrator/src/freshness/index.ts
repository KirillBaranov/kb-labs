/**
 * Freshness Module
 *
 * Index freshness detection and stale warnings.
 */

export {
  checkIndexFreshness,
  createStaleIndexWarning,
  createGitExecutor,
  readIndexMetadata,
  type IndexFreshness,
  type IndexMetadata,
} from './index-freshness';
