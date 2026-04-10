import { z } from 'zod';

export const releasePreviewSchema = z.object({
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  packages: z.array(
    z.object({
      name: z.string(),
      prev: z.string(),
      next: z.string(),
      bump: z.enum(['major', 'minor', 'patch', 'none']),
      breaking: z.number().optional(),
    })
  ),
  manifestJson: z.string().optional(),
  markdown: z.string().optional(),
});

