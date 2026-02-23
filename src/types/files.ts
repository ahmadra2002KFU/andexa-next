export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  active: boolean
  uploadedAt: string
}

export interface FileMetadata {
  filename: string
  rows: number
  columns: number
  size: string
  columnList: ColumnInfo[]
}

export interface ColumnInfo {
  name: string
  dtype: string
  nullCount: number
  sampleValues: unknown[]
}
