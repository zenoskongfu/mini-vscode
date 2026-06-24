import React, { createContext, useContext } from 'react'
import { IInstantiationService, ServiceIdentifier } from '../instantiation/instantiation'

/**
 * React 与 DI 容器之间的桥。
 *
 * VSCode 不是 React 应用：服务是由 InstantiationService 连接的普通 class。
 * 这个 Context 把容器暴露给 React 树，`useService` 再通过服务标识符解析服务。
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

/** 通过服务标识符解析服务实例（来自容器的单例） */
export function useService<T>(id: ServiceIdentifier<T>): T {
  const instantiationService = useContext(ServicesContext)
  if (!instantiationService) {
    throw new Error('useService must be used within <ServicesProvider>')
  }
  return instantiationService.get(id)
}
