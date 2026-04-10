import { createContext, useContext, type ReactNode } from 'react';
import { type StudioEventBus, eventBus } from './event-bus.js';

const EventBusContext = createContext<StudioEventBus>(eventBus);

export interface EventBusProviderProps {
  children: ReactNode;
  /** Override bus instance (for testing) */
  bus?: StudioEventBus;
}

/**
 * Provides the EventBus to the component tree.
 * Studio host wraps the entire app in this.
 */
export function EventBusProvider({ children, bus }: EventBusProviderProps) {
  return (
    <EventBusContext.Provider value={bus ?? eventBus}>
      {children}
    </EventBusContext.Provider>
  );
}

/**
 * Access the EventBus instance from context.
 * Internal — plugin authors use `useEventBus()` from studio-hooks instead.
 */
export function useEventBusContext(): StudioEventBus {
  return useContext(EventBusContext);
}
