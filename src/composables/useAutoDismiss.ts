import { watch, type Ref } from 'vue'

/**
 * Clears the given ref to its empty value after `timeoutMs`, restarting the
 * timer whenever it is set again. Used for transient feedback alerts that
 * should auto-dismiss (e.g. success/error banners) rather than persist.
 */
export function useAutoDismiss(source: Ref<string | null>, timeoutMs = 3000) {
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (value) => {
    if (timer) clearTimeout(timer)
    timer = null
    if (value) timer = setTimeout(() => { source.value = null }, timeoutMs)
  }, { immediate: true })
}
