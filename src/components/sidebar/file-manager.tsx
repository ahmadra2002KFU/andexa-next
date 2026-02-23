"use client"

import { useFileUpload } from "@/hooks/use-file-upload"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, Folder, Upload, FolderUp, Trash2, Check } from "lucide-react"
import { useState, useRef, useCallback } from "react"

export function FileManager() {
  const { files, activeFileId, upload, uploadFolder, deleteFile, setActiveFile } = useFileUpload()
  const [open, setOpen] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) upload(file)
      if (inputRef.current) inputRef.current.value = ""
    },
    [upload]
  )

  const handleFolderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (fileList && fileList.length > 0) uploadFolder(fileList)
      if (folderInputRef.current) folderInputRef.current.value = ""
    },
    [uploadFolder]
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Data Files
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 py-2">
          {files.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-2">No files uploaded</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {files.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                    f.id === activeFileId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setActiveFile(f.id)}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {f.id === activeFileId && <Check className="h-3 w-3" />}
                    {f.name}
                  </span>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteFile(f.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFolderChange}
            {...{ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              File
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderUp className="mr-1.5 h-3.5 w-3.5" />
              Folder
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
