<script setup lang="ts">
// PageShell is a layout component that renders three regions:
// - header
// - body
// - footer
// It uses Vue's slot mechanism to allow content injection.
</script>

<template>
  <div class="page-shell">
    <header class="region header">
      <slot name="header">
        <div class="header-content">Header</div>
      </slot>
    </header>
    <main class="region body">
      <slot name="body">
        <div class="body-content">Body</div>
      </slot>
    </main>
    <footer class="region footer">
      <slot name="footer">
        <div class="footer-content">Footer</div>
      </slot>
    </footer>
  </div>
</template>

<style scoped>
.page-shell {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.region {
  flex: 1;
  padding: 1rem;
  margin: 0.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 0.25rem;
}

.header {
  background-color: #f5f5f5;
  border-top-left-radius: 0.5rem;
  border-top-right-radius: 0.5rem;
}

.body {
  background-color: #ffffff;
  flex-grow: 1;
}

.footer {
  background-color: #f5f5f5;
  border-bottom-left-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}

@media (prefers-color-scheme: dark) {
  .header,
  .footer {
    background-color: #2f2f2f;
    border-color: #404040;
  }
  
  .body {
    background-color: #333333;
  }
}
</style>
