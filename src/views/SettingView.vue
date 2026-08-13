<script setup lang="ts">
</script>

<template>
  <div class="view-container w-full">
    <header class="region card header p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <slot name="header">
        <div class="card-body">
          <h1 class="text-xl font-semibold">Setting</h1>
          <p class="text-gray-600">Application settings</p>
        </div>
      </slot>
    </header>
    <main class="region body card p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <slot name="body">
        <div class="card-body">
          <p class="text-gray-500">This is the settings view content.</p>
        </div>
      </slot>
    </main>
    <footer class="region footer card p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]">
      <slot name="footer">
        <div class="card-body">
          <p>&copy; 2026 Scripts Management</p>
        </div>
      </slot>
    </footer>
  </div>
</template>


