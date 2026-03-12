"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme
    const theme = localStorage.getItem("theme");
    const isDarkTheme = 
      theme === "dark" || 
      (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    setIsDark(isDarkTheme);
    if (isDarkTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "p-2.5 rounded-2xl transition-all duration-300",
        "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700"
      )}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="w-5 h-5 animate-in zoom-in spin-in duration-300" />
      ) : (
        <Moon className="w-5 h-5 animate-in zoom-in spin-in duration-300" />
      )}
    </button>
  );
}
