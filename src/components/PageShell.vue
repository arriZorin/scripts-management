<script setup lang="ts">
// PageShell is a layout component that renders three regions:
// - header
// - body
// - footer
// It uses Vue's slot mechanism to allow content injection.
</script>

<template>
  <div class="page-shell flex flex-col min-h-full">
    <header class="region card header p-4 m-2 rounded border border-gray-300 bg-gray-100 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <slot name="header">
        <div class="card-body header-content">Header</div>
      </slot>
    </header>
    <main class="region card body p-4 m-2 rounded border border-gray-300 flex-grow dark:bg-[#333333] dark:border-[#404040]">
      <slot name="body">
        <div class="card-body body-content">Body</div>
      </slot>
    </main>
    <footer class="region card footer p-4 m-2 rounded border border-gray-300 bg-gray-100 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <slot name="footer">
        <div class="card-body footer-content">Footer</div>
      </slot>
    </footer>
  </div>
</template>


