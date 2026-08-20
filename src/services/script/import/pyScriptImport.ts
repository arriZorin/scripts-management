import type { ScriptInput } from '../../../models/Script'

export function filterPyFiles(paths: string[]): string[] {
	const lowerPaths = paths.map(p => p.toLowerCase())
	return lowerPaths
		.filter(p => p.endsWith('.py'))
		.map(p => paths[lowerPaths.indexOf(p)])
}

function normalizePath(p: string): string {
	return p.replace(/\\/g, '/')
}

export function toScriptInputs(paths: string[], existingPaths: string[]): ScriptInput[] {
	// Canonicalize separators so a file picked via the dialog (D:\...) and the
	// same file found by scan_files (D:/...) dedupe as one entry.
	const existingSet = new Set(existingPaths.map(normalizePath))
	const seen = new Set<string>()

	const result: ScriptInput[] = []

	for (const path of paths) {
		const normalized = normalizePath(path)
		if (existingSet.has(normalized)) {
			continue
		}
		if (seen.has(normalized)) {
			continue
		}
		seen.add(normalized)

		const name = normalized.split('/').pop() ?? normalized
		result.push({
			name,
			path: normalized,
			type: 'python',
		})
	}

	return result.sort((a, b) => a.name.localeCompare(b.name))
}
