import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { provideAppContext, useAppContext, type AppContext } from './useAppContext'

const Probe = defineComponent({
  setup() {
    const context = useAppContext()
    return () => h('span', context.scriptRepository === fakeContext.scriptRepository ? 'injected' : 'wrong')
  },
})

const fakeContext = {} as AppContext
const Provider = defineComponent({
  setup() {
    provideAppContext(fakeContext)
    return () => h(Probe)
  },
})

describe('useAppContext', () => {
  it('provides the application services to descendant components', () => {
    const container = document.createElement('div')
    const app = createApp(Provider)
    app.mount(container)

    expect(container.textContent).toBe('injected')

    app.unmount()
  })

  it('exposes a helper for registering the application context', () => {
    const container = document.createElement('div')
    const app = createApp(Provider)
    app.mount(container)

    expect(container.textContent).toBe('injected')

    app.unmount()
  })
})
