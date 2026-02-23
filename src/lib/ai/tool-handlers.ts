/**
 * Tool handler utilities for reading file metadata from Prisma
 * and delegating data operations to the Python executor.
 *
 * The actual tool execute functions are defined inline in tools.ts.
 * This module provides shared helper logic.
 */

import { prisma } from "@/lib/db/prisma";
import type { ColumnMetadata } from "@/types";

/**
 * Get column metadata for a specific file owned by a user.
 */
export async function getFileColumnMetadata(
  userId: string,
  filename: string
): Promise<ColumnMetadata | null> {
  const file = await prisma.uploadedFile.findFirst({
    where: { userId, originalFilename: filename },
  });
  if (!file?.columnMetadata) return null;
  return file.columnMetadata as unknown as ColumnMetadata;
}

/**
 * Get all files with their column names for a user (for join key detection).
 */
export async function getAllFilesSchema(userId: string) {
  const files = await prisma.uploadedFile.findMany({ where: { userId } });
  const schemas: Record<string, { columns: string[]; variableName: string; rows: number }> = {};
  const columnLocations: Record<string, string[]> = {};

  for (const f of files) {
    const meta = f.columnMetadata as Record<string, unknown> | null;
    const basicInfo = (meta?.basic_info ?? {}) as Record<string, unknown>;
    const cols = (basicInfo.column_names as string[]) ?? [];
    const varName = f.originalFilename
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    schemas[varName] = { columns: cols, variableName: varName, rows: f.rows };

    for (const col of cols) {
      if (!columnLocations[col]) columnLocations[col] = [];
      columnLocations[col].push(varName);
    }
  }

  const sharedColumns: Record<string, string[]> = {};
  for (const [col, locations] of Object.entries(columnLocations)) {
    if (locations.length > 1) sharedColumns[col] = locations;
  }

  return { schemas, sharedColumns, totalFiles: files.length };
}
