import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-150">
      
      {/* Sidebar - Desktop fixed & Mobile overlay drawer */}
      <Sidebar 
        mobileOpen={mobileMenuOpen} 
        onClose={() => setMobileMenuOpen(false)} 
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        
        {/* Header Bar */}
        <Topbar 
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} 
        />

        {/* Content Wrapper */}
        <main className="flex-1 overflow-y-auto p-8 focus:outline-none custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
