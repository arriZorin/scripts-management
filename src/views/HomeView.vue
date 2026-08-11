<script setup lang="ts">
</script>

<template>
  <div class="view-container w-full">
    <header class="region header p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <slot name="header">
        <h1 class="text-xl font-semibold">Home</h1>
        <p class="text-gray-600">Welcome to the application</p>
      </slot>
    </header>
    <main class="region body p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <slot name="body">
        <p class="text-gray-500">This is the home view content.</p>
      </slot>
    </main>
    <footer class="region footer p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]">
      <slot name="footer">
        <p>&copy; 2026 Scripts Management</p>
      </slot>
    </footer>
  </div>
</template>


