<script setup lang="ts">
</script>

<template>
  <div class="view-container">
    <header class="region header">
      <h1>Setting</h1>
      <p>Application settings</p>
    </header>
    <main class="region body">
      <p>This is the settings view content.</p>
    </main>
    <footer class="region footer">
      <p>&copy; 2026 Scripts Management</p>
    </footer>
  </div>
</template>

<style scoped>
.view-container {
  width: 100%;
}

.header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 1rem;
}

.body {
  padding: 1rem;
  min-height: 200px;
}

.footer {
  padding: 1rem;
  border-top: 1px solid #e0e0e0;
  margin-top: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: #666;
}

@media (prefers-color-scheme: dark) {
  .header,
  .body {
    border-color: #404040;
  }

  .footer {
    border-color: #404040;
    color: #999;
  }
}
</style>
