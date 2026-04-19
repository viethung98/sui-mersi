import { create } from 'zustand';

type OrdersStore = { isOpen: boolean; open: () => void; close: () => void; reset: () => void };

export const useOrdersStore = create<OrdersStore>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  reset: () => set({ isOpen: false }),
}));
