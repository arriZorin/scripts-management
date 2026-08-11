import { describe, it, expect } from 'vitest'
import { createApp, nextTick } from 'vue'
import ScriptsListView from './ScriptsListView.vue'

// Fake implementations for testing (no Tauri runtime needed)
class FakeScriptRepository {
  public items: any[] = []

  constructor(initial: any[] = []) {
    this.items = initial
  }

  list(): any[] {
    return [...this.items]
  }

  create(input: any): Promise<any> {
    const s = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.items.push(s)
    return Promise.resolve(s)
  }

  get(id: string): Promise<any> {
    return Promise.resolve(this.items.find((s) => s.id === id) ?? null)
  }

  update(id: string, input: any): Promise<any> {
    const index = this.items.findIndex((s) => s.id === id)
    if (index === -1) {
      return Promise.reject(new Error('Script not found'))
    }
    this.items[index] = { ...this.items[index], ...input, updatedAt: new Date().toISOString() }
    return Promise.resolve(this.items[index])
  }

  delete(id: string): Promise<void> {
    this.items = this.items.filter((s) => s.id !== id)
    return Promise.resolve()
  }
}

class FakeScriptPicker {
  public fileResult: string | null = null
  public folderResult: string | null = null

  pickFile(): Promise<string | null> {
    return Promise.resolve(this.fileResult)
  }

  pickFolder(): Promise<string | null> {
    return Promise.resolve(this.folderResult)
  }
}

class FakeFileScanner {
  public result: string[] = []

  scan(): Promise<string[]> {
    return Promise.resolve(this.result)
  }
}

function mountView(repo: FakeScriptRepository, picker: FakeScriptPicker, scanner: FakeFileScanner) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(ScriptsListView, { repository: repo, picker, scanner })
  app.mount(container)
  return { container, app }
}

function buttonTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '')
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

describe('ScriptsListView', () => {
  it('renders header, footer, and Add File/Add Folder buttons', async () => {
    const { container, app } = mountView(new FakeScriptRepository(), new FakeScriptPicker(), new FakeFileScanner())
    await nextTick()

    expect(container.querySelector('.region.header h1')?.textContent?.trim()).toBe('Scripts List')
    expect(container.querySelector('.region.header p')?.textContent?.trim()).toBe('Manage your Python scripts')
    expect(container.querySelector('.region.footer')?.textContent?.trim()).toBe('© 2026 Scripts Management')
    expect(buttonTexts(container)).toEqual(['Add File', 'Add Folder'])

    app.unmount()
  })

  it('renders empty state when repo has no scripts', async () => {
    const { container, app } = mountView(new FakeScriptRepository(), new FakeScriptPicker(), new FakeFileScanner())
    await nextTick()

    expect(container.querySelector('.region.body')?.textContent).toContain('No scripts yet. Add a .py file or folder.')

    app.unmount()
  })

  it('shows a seeded script after a refresh action (add file with duplicate path)', async () => {
    const repo = new FakeScriptRepository([
      {
        name: 'backup.py',
        path: 'C:/scripts/backup.py',
        id: 'test-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ])
    const picker = new FakeScriptPicker()
    // Picking the already-seeded path is a duplicate → nothing created, but the list refreshes (load())
    picker.fileResult = 'C:/scripts/backup.py'
    const { container, app } = mountView(repo, picker, new FakeFileScanner())
    await nextTick()

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add File')!
    addBtn.click()
    await flush()

    const listItems = Array.from(container.querySelectorAll('.region.body li')).map((li) => li.textContent)
    expect(listItems).toEqual(['backup.py — C:/scripts/backup.py'])
    expect(container.querySelector('.region.body')?.textContent).toContain('Added 0 script(s), skipped 1.')

    app.unmount()
  })

  it('clicking Add File adds the picked script', async () => {
    const repo = new FakeScriptRepository()
    const picker = new FakeScriptPicker()
    picker.fileResult = 'C:/scripts/new.py'
    const { container, app } = mountView(repo, picker, new FakeFileScanner())
    await nextTick()

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add File')!
    addBtn.click()
    await flush()

    const listItems = Array.from(container.querySelectorAll('.region.body li')).map((li) => li.textContent)
    expect(listItems).toEqual(['new.py — C:/scripts/new.py'])

    app.unmount()
  })

  it('clicking Add Folder adds all .py files, ignoring others', async () => {
    const repo = new FakeScriptRepository()
    const picker = new FakeScriptPicker()
    picker.folderResult = 'C:/a'
    const scanner = new FakeFileScanner()
    scanner.result = ['C:/a/x.py', 'C:/a/y.py', 'C:/a/readme.txt']
    const { container, app } = mountView(repo, picker, scanner)
    await nextTick()

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add Folder')!
    addBtn.click()
    await flush()

    const contents = Array.from(container.querySelectorAll('.region.body li')).map((li) => li.textContent)
    expect(contents).toContain('x.py — C:/a/x.py')
    expect(contents).toContain('y.py — C:/a/y.py')
    expect(contents).not.toContain('readme.txt')

    app.unmount()
  })
})
