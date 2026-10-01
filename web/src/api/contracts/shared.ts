/** The common HTTP response envelope returned by the backend. */
export type ApiResponse<T> = {
  success: boolean
  message: string | null
  data: T | null
  errors: unknown
}

export type PaginationMetadata = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export type PagedApiResponse<T> = Omit<ApiResponse<T[]>, 'data'> & {
  data: T[]
  pagination: PaginationMetadata
}
