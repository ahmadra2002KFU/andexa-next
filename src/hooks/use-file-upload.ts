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
      const cleanName = file.name.includes("/") ? file.name.split("/").pop()! : file.name
      const uploaded: UploadedFile = {
        id: data.id || cleanName,
        name: data.originalFilename || cleanName,
        size: file.size,
        type: file.type,
        active: true,
        uploadedAt: new Date().toISOString(),
      }
      addFile(uploaded)
      setActiveFile(uploaded.id)
      if (data.rows != null) {
        setMetadata({
          filename: data.originalFilename || cleanName,
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
    let lastFileId: string | null = null

    // Deactivate all existing files once before the batch
    try {
      await fetch("/api/files/deactivate-all", { method: "POST" })
    } catch {
      // non-critical
    }

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/upload?skipDeactivate=true", {
          method: "POST",
          body: formData,
        })
        if (!res.ok) throw new Error("Upload failed")
        const data = await res.json()
        const cleanName = file.name.includes("/") ? file.name.split("/").pop()! : file.name
        const uploaded: UploadedFile = {
          id: data.id || cleanName,
          name: data.originalFilename || cleanName,
          size: file.size,
          type: file.type,
          active: true,
          uploadedAt: new Date().toISOString(),
        }
        addFile(uploaded)
        lastFileId = uploaded.id
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

    if (lastFileId) setActiveFile(lastFileId)
    setFolderUpload(false)
  }, [addFile, setActiveFile, setMetadata, setFolderUpload])

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files")
      if (res.ok) {
        const data = await res.json()
        const raw: any[] = Array.isArray(data) ? data : data.files || []
        // Map DB shape (originalFilename, isActive) to store shape (name, active)
        const mapped: UploadedFile[] = raw.map((f: any) => ({
          id: f.id,
          name: f.originalFilename ?? f.name ?? "unknown",
          size: (f.sizeMb ?? 0) * 1024 * 1024,
          type: "",
          active: f.isActive ?? f.active ?? false,
          uploadedAt: f.createdAt ?? f.uploadedAt ?? new Date().toISOString(),
        }))
        setFiles(mapped)
        // Set the active file from DB
        const active = mapped.find((f) => f.active)
        if (active) setActiveFile(active.id)
      }
    } catch {
      // API may not exist yet
    }
  }, [setFiles, setActiveFile])

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
