import { ref } from 'vue';

export interface NavItem {
  id: string;
  label: string;
}

export function useNavigation() {
  const activeView = ref('home');

  const navItems: NavItem[] = [
    { id: 'home', label: 'Home' },
    { id: 'scripts-list', label: 'Scripts List' },
    { id: 'task', label: 'Task' },
    { id: 'logging', label: 'Logging' },
    { id: 'setting', label: 'Setting' }
  ];

  function setView(viewId: string) {
    activeView.value = viewId;
  }

  return {
    activeView,
    setView,
    navItems
  };
}
