import path from 'node:path'

// Matches ID conventions like "GW-042" and multi-segment ones like "GW-PC-01"
// or "AUTH-VAL-03" — an uppercase-letter run followed by one or more
// hyphen-separated uppercase/digit segments.
const ID_PATTERN = /^[\[#]?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)[:\]]\s*/

export function matchConventionalId(title: string): { id: string; rest: string } | null {
  const match = title.match(ID_PATTERN)
  if (!match) {return null}
  return { id: match[1]!, rest: title.slice(match[0].length) }
}

export function relativizeSpec(reporterDir: string, specFile: string): string {
  return path.relative(path.join(reporterDir, '..'), specFile)
}
