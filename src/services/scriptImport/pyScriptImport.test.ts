import { describe, it, expect } from 'vitest'
import { filterPyFiles, toScriptInputs } from './pyScriptImport'
import type { ScriptInput } from '../../models/Script'

describe('filterPyFiles', () => {
	it('filters .py files case-insensitively and preserves order', () => {
		const input = [
			'a.py',
			'b.PY',
			'c.Py',
			'd.txt',
			'e.json',
			'f',
			'g.pyc',
		]
		const result = filterPyFiles(input)
		expect(result).toEqual(['a.py', 'b.PY', 'c.Py'])
	})

	it('returns empty array for empty input', () => {
		const result = filterPyFiles([])
		expect(result).toEqual([])
	})
})

describe('toScriptInputs', () => {
	it('maps name/path/type correctly for mixed separators', () => {
		const paths = [
			'C:/work/backup.py',
			'D:\\work\\cleanup.py',
		]
		const result = toScriptInputs(paths, [])
		expect(result).toHaveLength(2)
		expect(result[0]).toMatchObject<ScriptInput>({
			name: 'backup.py',
			path: 'C:/work/backup.py',
			type: 'python',
		})
		expect(result[1]).toMatchObject<ScriptInput>({
			name: 'cleanup.py',
			path: 'D:/work/cleanup.py',
			type: 'python',
		})
	})

	it('stores paths in canonical forward-slash form', () => {
		const result = toScriptInputs(['D:\\work\\cleanup.py'], [])
		expect(result).toHaveLength(1)
		expect(result[0].path).toBe('D:/work/cleanup.py')
	})

	it('skips an existing path even when separators differ (dialog vs folder scan)', () => {
		const existing = ['D:\\work\\backup.py'] as string[]
		const paths = ['D:/work/backup.py', 'D:/work/cleanup.py'] as string[]
		const result = toScriptInputs(paths, existing)
		expect(result).toHaveLength(1)
		expect(result[0].name).toBe('cleanup.py')
	})

	it('dedupes within input across separator styles', () => {
		const paths = [
			'D:/work/a.py',
			'D:\\work\\a.py',
			'D:\\work\\b.py',
		] as string[]
		const result = toScriptInputs(paths, [])
		expect(result).toHaveLength(2)
		expect(result.map((r) => r.name)).toEqual(['a.py', 'b.py'])
	})

	it('skips existing paths', () => {
		const existing = ['C:/work/backup.py'] as string[]
		const paths = ['C:/work/backup.py', 'D:/work/cleanup.py'] as string[]
		const result = toScriptInputs(paths, existing)
		expect(result).toHaveLength(1)
		expect(result[0].name).toBe('cleanup.py')
	})

	it('dedupes within input and sorts by name', () => {
		const paths = [
			'C:/zebra.py',
			'C:/apple.py',
			'C:/zebra.py',
			'C:/banana.py',
		] as string[]
		const result = toScriptInputs(paths, [])
		expect(result).toHaveLength(3)
		expect(result[0].name).toBe('apple.py')
		expect(result[1].name).toBe('banana.py')
		expect(result[2].name).toBe('zebra.py')
	})

	it('returns empty array for empty inputs', () => {
		const result = toScriptInputs([] as string[], [] as string[])
		expect(result).toEqual([])
	})
})
