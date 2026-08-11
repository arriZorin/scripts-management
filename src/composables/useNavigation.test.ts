import { describe, it, expect } from 'vitest';
import { useNavigation } from './useNavigation';

describe('useNavigation', () => {
  it('default active view is home', () => {
    const { activeView } = useNavigation();
    
    expect(activeView.value).toBe('home');
  });

  it('nav items are exactly Home, Scripts List, Task, Setting', () => {
    const { navItems } = useNavigation();
    
    expect(navItems.length).toBe(4);
    expect(navItems).toEqual([
      { id: 'home', label: 'Home' },
      { id: 'scripts-list', label: 'Scripts List' },
      { id: 'task', label: 'Task' },
      { id: 'setting', label: 'Setting' }
    ]);
  });

  it('setView switches the active view', () => {
    const { activeView, setView } = useNavigation();
    
    expect(activeView.value).toBe('home');
    setView('scripts-list');
    expect(activeView.value).toBe('scripts-list');
    setView('task');
    expect(activeView.value).toBe('task');
  });
});
