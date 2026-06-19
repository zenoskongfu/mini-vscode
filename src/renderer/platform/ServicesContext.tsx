import React, { createContext, useContext } from 'react'
import { IInstantiationService, ServiceIdentifier } from '../instantiation/instantiation'

/**
 * React bridge to the DI container.
 *
 * VSCode isn't React — services are plain classes wired by the
 * InstantiationService. This Context exposes that container to the React tree,
 * and `useService` resolves a service by its identifier.
 */
const ServicesContext = createContext<IInstantiationService | null>(null)

export function ServicesProvider({
  instantiationService,
  children
}: {
  instantiationService: IInstantiationService
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <ServicesContext.Provider value={instantiationService}>
      {children}
    </ServicesContext.Provider>
  )
}

/** Resolve a service instance by its identifier (singleton from the container) */
export function useService<T>(id: ServiceIdentifier<T>): T {
  const instantiationService = useContext(ServicesContext)
  if (!instantiationService) {
    throw new Error('useService must be used within <ServicesProvider>')
  }
  return instantiationService.get(id)
}
