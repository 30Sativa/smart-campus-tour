import { useThemeStore } from '../../stores/theme-store';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center justify-center text-slate-700 dark:text-slate-300"
      aria-label="Toggle Theme"
      title={theme === 'dark' ? 'Chuyển sang Giao diện sáng' : 'Chuyển sang Giao diện tối'}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
