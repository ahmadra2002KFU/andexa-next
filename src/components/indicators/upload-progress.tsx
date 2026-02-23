"use client"

import { useFileStore } from "@/stores/file-store"

export function UploadProgress() {
  const { uploading, uploadProgress, folderUploading, folderUploadTotal, folderUploadCompleted } = useFileStore()

  if (!uploading && !folderUploading) return null

  if (folderUploading) {
    const pct = folderUploadTotal > 0 ? Math.round((folderUploadCompleted / folderUploadTotal) * 100) : 0
    return (
      <div className="mx-auto max-w-3xl rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Uploading file {folderUploadCompleted} of {folderUploadTotal}...</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>Uploading...</span>
        <span>{uploadProgress}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-150"
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
    </div>
  )
}
