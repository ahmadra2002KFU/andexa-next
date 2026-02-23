import { create } from "zustand"
import type { UploadedFile, FileMetadata } from "@/types/files"

interface FileState {
  files: UploadedFile[]
  activeFileId: string | null
  metadata: FileMetadata | null
  uploading: boolean
  uploadProgress: number
  folderUploading: boolean
  folderUploadTotal: number
  folderUploadCompleted: number

  setFiles: (files: UploadedFile[]) => void
  addFile: (file: UploadedFile) => void
  removeFile: (id: string) => void
  setActiveFile: (id: string) => void
  setMetadata: (metadata: FileMetadata | null) => void
  setUploading: (uploading: boolean, progress?: number) => void
  setFolderUpload: (uploading: boolean, total?: number, completed?: number) => void
  clearAll: () => void
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  activeFileId: null,
  metadata: null,
  uploading: false,
  uploadProgress: 0,
  folderUploading: false,
  folderUploadTotal: 0,
  folderUploadCompleted: 0,

  setFiles: (files) => set({ files }),
  addFile: (file) =>
    set((state) => ({ files: [...state.files, file] })),
  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      activeFileId: state.activeFileId === id ? null : state.activeFileId,
    })),
  setActiveFile: (id) => set({ activeFileId: id }),
  setMetadata: (metadata) => set({ metadata }),
  setUploading: (uploading, progress = 0) => set({ uploading, uploadProgress: progress }),
  setFolderUpload: (uploading, total = 0, completed = 0) =>
    set({ folderUploading: uploading, folderUploadTotal: total, folderUploadCompleted: completed }),
  clearAll: () =>
    set({ files: [], activeFileId: null, metadata: null, uploading: false, uploadProgress: 0, folderUploading: false, folderUploadTotal: 0, folderUploadCompleted: 0 }),
}))
