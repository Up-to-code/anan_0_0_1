// lib/actions/types.ts
export interface TimeFilter {
    range: '7D' | '30D' | '3M' | '6M' | '1Y' | 'ALL'
    startDate: Date
    endDate: Date
  }
  
  export interface DashboardStats {
    totalTokens: number
    totalCost: number
    activeUsers: number
    apiRequests: number
    changePercentage: number
  }
  
  export interface ChartData {
    tokenUsage: Array<{
      period: string
      tokens: number
      cost: number
    }>
    modelUsage: Array<{
      name: string
      tokens: number
      color: string
    }>
    clientActivity: Array<{
      period: string
      requests: number
      tokens: number
      activeUsers: number
    }>
    costAnalysis: Array<{
      model: string
      development: number
      inference: number
      maintenance: number
    }>
    platformPerformance: Array<{
      platform: string
      uptime: number
      reliability: number
    }>
  }
  
  export interface SearchFilters {
    timeRange?: string
    projectId?: string
    modelId?: string
    organizationId?: string
    minCost?: number
    maxCost?: number
    minTokens?: number
    maxTokens?: number
  }
  
  export interface SearchResult {
    type: 'project' | 'usage' | 'cost' | 'user' | 'organization'
    id: string
    title: string
    description: string
    relevance: number
    metadata: Record<string, unknown>
  }
  
  export interface Project {
    id: string
    name: string
    description?: string
    organizationId: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }
  
  export interface Organization {
    id: string
    name: string
    slug: string
    plan: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }