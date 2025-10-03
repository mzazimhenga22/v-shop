// src/components/admin/Tabs.tsx
import React from "react";

type TabsProps<T extends string> = {
  tabs: readonly T[];
  activeTab: T;
  onChange: (tab: T) => void;
};

const Tabs = <T extends string>({ tabs, activeTab, onChange }: TabsProps<T>) => (
  <div className="flex justify-center mb-6" role="navigation" aria-label="Admin tabs">
    <div
      role="tablist"
      aria-orientation="horizontal"
      className="inline-flex items-center rounded-full p-1 shadow-inner transition-colors duration-300
                 bg-white/20 dark:bg-gray-900/30 border border-white/10 dark:border-black/20"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            onClick={() => onChange(tab)}
            className={`px-4 sm:px-5 py-2 text-sm font-semibold rounded-full transition-colors duration-200
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-400
                        ${isActive
                          ? "bg-emerald-600 text-white shadow-md ring-1 ring-emerald-300/40 dark:ring-emerald-700/40"
                          : "text-gray-700 dark:text-gray-300 hover:bg-white/10 dark:hover:bg-white/5"}
                        `}
          >
            {tab}
          </button>
        );
      })}
    </div>
  </div>
);

export default Tabs;
