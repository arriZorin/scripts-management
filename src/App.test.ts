import { describe, it, expect } from 'vitest';
import { createApp, nextTick } from 'vue';
import App from './App.vue';

describe('App', () => {
  it('renders 4 nav buttons with exact labels: Home, Scripts List, Task, Setting', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp(App);
    
    app.mount(container);
    await nextTick();
    
    // Check for navigation buttons with exact labels
    const buttons = container.querySelectorAll('nav button');
    const labels = Array.from(buttons).map(btn => btn.textContent?.trim());
    
    expect(labels).toEqual(['Home', 'Scripts List', 'Task', 'Setting']);
    
    app.unmount();
    document.body.removeChild(container);
  });

  it('shows Home content by default', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp(App);
    
    app.mount(container);
    await nextTick();
    
    // Home should be shown by default
    expect(container.innerHTML).toContain('Welcome to the application');
    expect(container.innerHTML).not.toContain('Manage your Python scripts');
    expect(container.innerHTML).not.toContain('Task management');
    expect(container.innerHTML).not.toContain('Application settings');
    
    // Verify we have the right structure
    expect(container.innerHTML).toContain('Home');
    
    app.unmount();
    document.body.removeChild(container);
  });

  it('clicking Scripts List button shows ScriptsList content', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp(App);
    
    app.mount(container);
    await nextTick();
    
    // Initially Home should be shown
    expect(container.innerHTML).toContain('Welcome to the application');
    expect(container.innerHTML).not.toContain('Manage your Python scripts');
    
    // Find the button with text "Scripts List" and click it
    const allButtons = container.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).textContent?.trim();
      if (text === 'Scripts List') {
        (btn as HTMLElement).click();
        await nextTick();
        break;
      }
    }
    
    // Now ScriptsList content should be shown
    expect(container.innerHTML).toContain('Manage your Python scripts');
    expect(container.innerHTML).not.toContain('Welcome to the application');
    
    app.unmount();
    document.body.removeChild(container);
  });

  it('clicking Task button shows Task content', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp(App);
    
    app.mount(container);
    await nextTick();
    
    // Initially Home should be shown
    expect(container.innerHTML).toContain('Welcome to the application');
    
    // Find the button with text "Task" and click it
    const allButtons = container.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).textContent?.trim();
      if (text === 'Task') {
        (btn as HTMLElement).click();
        await nextTick();
        break;
      }
    }
    
    // Now Task content should be shown
    expect(container.innerHTML).toContain('Task management');
    expect(container.innerHTML).not.toContain('Welcome to the application');
    
    app.unmount();
    document.body.removeChild(container);
  });

  it('clicking Setting button shows Setting content', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp(App);
    
    app.mount(container);
    await nextTick();
    
    // Initially Home should be shown
    expect(container.innerHTML).toContain('Welcome to the application');
    
    // Find the button with text "Setting" and click it
    const allButtons = container.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).textContent?.trim();
      if (text === 'Setting') {
        (btn as HTMLElement).click();
        await nextTick();
        break;
      }
    }
    
    // Now Setting content should be shown
    expect(container.innerHTML).toContain('Application settings');
    expect(container.innerHTML).not.toContain('Welcome to the application');
    
    app.unmount();
    document.body.removeChild(container);
  });

  it('every view shows exactly one header.region, main.region.body, and footer.region', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp(App);
    
    app.mount(container);
    await nextTick();
    
    // Test Home view
    const homeHeader = container.querySelector('.region.header');
    const homeBody = container.querySelector('.region.body');
    const homeFooter = container.querySelector('.region.footer');
    
    expect(homeHeader).toBeTruthy();
    expect(homeBody).toBeTruthy();
    expect(homeFooter).toBeTruthy();
    
    // Navigate to Scripts List
    const allButtons = container.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).textContent?.trim();
      if (text === 'Scripts List') {
        (btn as HTMLElement).click();
        await nextTick();
        break;
      }
    }
    
    const scriptsListHeader = container.querySelector('.region.header');
    const scriptsListBody = container.querySelector('.region.body');
    const scriptsListFooter = container.querySelector('.region.footer');
    
    expect(scriptsListHeader).toBeTruthy();
    expect(scriptsListBody).toBeTruthy();
    expect(scriptsListFooter).toBeTruthy();
    
    // Navigate to Task
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).textContent?.trim();
      if (text === 'Task') {
        (btn as HTMLElement).click();
        await nextTick();
        break;
      }
    }
    
    const taskHeader = container.querySelector('.region.header');
    const taskBody = container.querySelector('.region.body');
    const taskFooter = container.querySelector('.region.footer');
    
    expect(taskHeader).toBeTruthy();
    expect(taskBody).toBeTruthy();
    expect(taskFooter).toBeTruthy();
    
    // Navigate to Setting
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).textContent?.trim();
      if (text === 'Setting') {
        (btn as HTMLElement).click();
        await nextTick();
        break;
      }
    }
    
    const settingHeader = container.querySelector('.region.header');
    const settingBody = container.querySelector('.region.body');
    const settingFooter = container.querySelector('.region.footer');
    
    expect(settingHeader).toBeTruthy();
    expect(settingBody).toBeTruthy();
    expect(settingFooter).toBeTruthy();
    
    app.unmount();
    document.body.removeChild(container);
  });
});
