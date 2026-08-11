import type { ScriptInput } from '../../models/Script'

export function filterPyFiles(paths: string[]): string[] {
	const lowerPaths = paths.map(p => p.toLowerCase())
	return lowerPaths
		.filter(p => p.endsWith('.py'))
		.map(p => paths[lowerPaths.indexOf(p)])
}

export function toScriptInputs(paths: string[], existingPaths: string[]): ScriptInput[] {
	const existingSet = new Set(existingPaths)
	const seen = new Set<string>()

	const result: ScriptInput[] = []

	for (const path of paths) {
		if (existingSet.has(path)) {
			continue
		}
		if (seen.has(path)) {
			continue
		}
		seen.add(path)

		const name = path.split(/[/\\]/).pop() ?? path
		result.push({
			name,
			path,
			type: 'python',
		})
	}

	return result.sort((a, b) => a.name.localeCompare(b.name))
}
