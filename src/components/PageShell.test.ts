import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import PageShell from './PageShell.vue';

describe('PageShell', () => {
  it('renders header, body, and footer regions from slots', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp({
      components: { PageShell },
      render() {
        return h(PageShell, null, {
          header: () => 'Header Content',
          body: () => 'Body Content',
          footer: () => 'Footer Content'
        });
      }
    });
    
    app.mount(container);
    
    expect(container.innerHTML).toContain('Header Content');
    expect(container.innerHTML).toContain('Body Content');
    expect(container.innerHTML).toContain('Footer Content');
    
    // Check that the regions have correct classes
    expect(container.innerHTML).toContain('region');
    expect(container.innerHTML).toContain('header');
    expect(container.innerHTML).toContain('body');
    expect(container.innerHTML).toContain('footer');
    
    app.unmount();
    document.body.removeChild(container);
  });

  it('renders default content when slots are not provided', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const app = createApp({
      components: { PageShell },
      render() {
        return h(PageShell);
      }
    });
    
    app.mount(container);
    
    expect(container.innerHTML).toContain('Header');
    expect(container.innerHTML).toContain('Body');
    expect(container.innerHTML).toContain('Footer');
    
    app.unmount();
    document.body.removeChild(container);
  });
});
