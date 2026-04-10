/**
 * Mock API functions for testing CLI commands
 */

export interface MockUpdateResult {
  api: { added: number; updated: number; removed: number };
  deps: { edgesAdded: number; edgesRemoved: number };
  diff: { files: number };
  budget: { limitMs: number; usedMs: number; partial: boolean };
}

export interface MockPackResult {
  markdown: string;
  json: {
    sectionUsage: Record<string, number>;
  };
  tokensEstimate: number;
}

export async function mockUpdateIndexes(options: any): Promise<MockUpdateResult> {
  // Simulate some processing time
  await new Promise<void>(resolve => { setTimeout(resolve, 100); });
  
  return {
    api: { added: 2, updated: 1, removed: 0 },
    deps: { edgesAdded: 5, edgesRemoved: 1 },
    diff: { files: 3 },
    budget: { 
      limitMs: options.timeBudgetMs || 1000, 
      usedMs: 800, 
      partial: false 
    }
  };
}

export async function mockBuildPack(options: any): Promise<MockPackResult> {
  // Simulate some processing time
  await new Promise<void>(resolve => { setTimeout(resolve, 150); });
  
  const intent = options.intent || 'test intent';
  const product = options.product || 'mind';
  
  return {
    markdown: `# Mind Pack\n\n**Intent**: ${intent}\n**Product**: ${product}\n\nThis is a mock pack result for testing.\n\n## Generated Content\n\n- Mock API data\n- Mock dependency graph\n- Mock snippets\n\n*Generated with seed: ${options.seed || 'none'}*`,
    json: {
      sectionUsage: {
        overview: 200,
        api: 600,
        diffs: 150,
        snippets: 400,
        configs: 50
      }
    },
    tokensEstimate: 1400
  };
}

export async function mockInitMindStructure(_options: any): Promise<string> {
  // Simulate some processing time
  await new Promise<void>(resolve => { setTimeout(resolve, 50); });
  
  return '.kb/mind';
}
