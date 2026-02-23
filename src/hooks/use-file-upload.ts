"use client"

import { useCallback } from "react"
import { useFileStore } from "@/stores/file-store"
import type { UploadedFile, FileMetadata } from "@/types/files"

export function useFileUpload() {
  const { files, activeFileId, metadata, uploading, uploadProgress, folderUploading, folderUploadTotal, folderUploadCompleted, setFiles, addFile, removeFile, setActiveFile, setMetadata, setUploading, setFolderUpload, clearAll } = useFileStore()

  const upload = useCallback(async (file: File) => {
    setUploading(true, 0)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()
      const uploaded: UploadedFile = {
        id: data.id || file.name,
        name: data.originalFilename || file.name,
        size: file.size,
        type: file.type,
        active: true,
        uploadedAt: new Date().toISOString(),
      }
      addFile(uploaded)
      setActiveFile(uploaded.id)
      if (data.rows != null) {
        setMetadata({
          filename: data.originalFilename || file.name,
          rows: data.rows,
          columns: data.columns,
          size: `${data.sizeMb ?? 0} MB`,
          columnList: [],
        })
      }
    } catch (err) {
      console.error("Upload error:", err)
    } finally {
      setUploading(false, 100)
    }
  }, [addFile, setActiveFile, setMetadata, setUploading])

  const uploadFolder = useCallback(async (fileList: FileList) => {
    const validExtensions = [".csv", ".xlsx", ".xls"]
    const validFiles = Array.from(fileList).filter((f) => {
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."))
      return validExtensions.includes(ext)
    })

    if (validFiles.length === 0) return

    setFolderUpload(true, validFiles.length, 0)
    let firstFileId: string | null = null

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })
        if (!res.ok) throw new Error("Upload failed")
        const data = await res.json()
        const uploaded: UploadedFile = {
          id: data.id || file.name,
          name: data.originalFilename || file.name,
          size: file.size,
          type: file.type,
          active: true,
          uploadedAt: new Date().toISOString(),
        }
        addFile(uploaded)
        if (i === 0) firstFileId = uploaded.id
        if (data.rows != null) {
          setMetadata({
            filename: data.originalFilename || file.name,
            rows: data.rows,
            columns: data.columns,
            size: `${data.sizeMb ?? 0} MB`,
            columnList: [],
          })
        }
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err)
      }
      setFolderUpload(true, validFiles.length, i + 1)
    }

    if (firstFileId) setActiveFile(firstFileId)
    setFolderUpload(false)
  }, [addFile, setActiveFile, setMetadata, setFolderUpload])

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files")
      if (res.ok) {
        const data = await res.json()
        setFiles(Array.isArray(data) ? data : data.files || [])
      }
    } catch {
      // API may not exist yet
    }
  }, [setFiles])

  const deleteFile = useCallback(async (id: string) => {
    try {
      await fetch(`/api/files/${id}`, { method: "DELETE" })
      removeFile(id)
    } catch {
      removeFile(id)
    }
  }, [removeFile])

  return {
    files,
    activeFileId,
    metadata,
    uploading,
    uploadProgress,
    folderUploading,
    folderUploadTotal,
    folderUploadCompleted,
    upload,
    uploadFolder,
    fetchFiles,
    deleteFile,
    setActiveFile,
    clearAll,
  }
}
