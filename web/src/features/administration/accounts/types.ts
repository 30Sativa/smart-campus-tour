/** Application roles as the account API returns them (ADR-0020: TechnicalStaff added). */
export type AccountRole = 'Admin' | 'Staff' | 'TechnicalStaff' | 'Representative'
export type CreatableAccountRole = Exclude<AccountRole, 'Admin'>

export type AccountListItem = {
  id: string
  username: string
  fullName: string
  role: AccountRole | null
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  /** Opaque account version the reset-password request sends back (ADR-0058). */
  rowVersion: string
}

export type CreateAccountInput = {
  username: string
  fullName: string
  role: CreatableAccountRole
  initialPassword: string
}

export type AccountSortField = 'username' | 'fullName' | 'role' | 'isActive' | 'createdAt' | 'updatedAt'
export type AccountSort = AccountSortField | `-${AccountSortField}`

export type AccountListQuery = {
  search?: string
  sort?: AccountSort | ''
  page: number
  size: number
}

