import React, { createContext, useContext, useState } from 'react';
import Sidebar from '@/components/Sidebar';

type SidebarContextType = { openSidebar: () => void };

const SidebarContext = createContext<SidebarContextType>({ openSidebar: () => {} });

export function useSidebar(): SidebarContextType {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ openSidebar: () => setOpen(true) }}>
      {children}
      <Sidebar visible={open} onClose={() => setOpen(false)} />
    </SidebarContext.Provider>
  );
}
