import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { executorClient } from "@/lib/executor/client";
import type { Tool } from "ai";

type AnyTool = Tool<any, any>;

/**
 * Create data exploration tools bound to a specific user.
 */
export function createDataTools(userId: string): Record<string, AnyTool> {
  return {
    discoverData: {
      description:
        "List ALL uploaded files with column names, row counts, and variable names. Call this FIRST when multiple files may be involved.",
      inputSchema: z.object({}),
      execute: async () => {
        const files = await prisma.uploadedFile.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        if (files.length === 0) return { success: false, error: "No files uploaded." };
        const active = files.find((f) => f.isActive);
        return {
          success: true,
          totalFiles: files.length,
          activeFile: active?.originalFilename ?? null,
          files: files.map((f) => {
            const meta = f.columnMetadata as Record<string, unknown> | null;
            const basicInfo = (meta?.basic_info ?? {}) as Record<string, unknown>;
            return {
              filename: f.originalFilename,
              variableName: filenameToVariable(f.originalFilename),
              rows: f.rows,
              columns: f.columns,
              columnNames: (basicInfo.column_names as string[]) ?? [],
              isActive: f.isActive,
            };
          }),
        };
      },
    },

    inspectColumn: {
      description: "Get sample values, dtype, and statistics from a specific column in a specific file.",
      inputSchema: z.object({
        fileName: z.string().describe("Exact filename (e.g. 'patients.csv')"),
        columnName: z.string().describe("Exact column name"),
        sampleSize: z.number().int().min(1).max(50).default(10),
      }),
      execute: async (input: { fileName: string; columnName: string; sampleSize: number }) => {
        const file = await prisma.uploadedFile.findFirst({
          where: { userId, originalFilename: input.fileName },
        });
        if (!file) return { success: false, error: `File '${input.fileName}' not found.` };
        return executorClient.inspectColumn(file.storedPath, input.columnName, input.sampleSize);
      },
    },

    findJoinKeys: {
      description: "Analyze two files and return columns that can be used as join keys.",
      inputSchema: z.object({
        file1: z.string().describe("First filename"),
        file2: z.string().describe("Second filename"),
      }),
      execute: async (input: { file1: string; file2: string }) => {
        const [f1, f2] = await Promise.all([
          prisma.uploadedFile.findFirst({ where: { userId, originalFilename: input.file1 } }),
          prisma.uploadedFile.findFirst({ where: { userId, originalFilename: input.file2 } }),
        ]);
        if (!f1 || !f2) return { success: false, error: "One or both files not found." };
        const cols1 = getColumnNames(f1.columnMetadata);
        const cols2 = getColumnNames(f2.columnMetadata);
        const shared = cols1.filter((c) => cols2.includes(c));
        return {
          success: true,
          sharedColumns: shared,
          file1Columns: cols1,
          file2Columns: cols2,
          recommendations: shared.length > 0
            ? shared.map((c) => `JOIN ON '${c}': exists in both files`)
            : ["WARNING: No common join keys found."],
        };
      },
    },

    setActiveFile: {
      description: "Switch which file becomes the 'df' variable for code execution.",
      inputSchema: z.object({
        fileName: z.string().describe("Exact filename to set as active"),
      }),
      execute: async (input: { fileName: string }) => {
        const file = await prisma.uploadedFile.findFirst({
          where: { userId, originalFilename: input.fileName },
        });
        if (!file) return { success: false, error: `File '${input.fileName}' not found.` };
        await prisma.uploadedFile.updateMany({ where: { userId }, data: { isActive: false } });
        await prisma.uploadedFile.update({ where: { id: file.id }, data: { isActive: true } });
        return { success: true, message: `Active file set to '${input.fileName}'.` };
      },
    },

    queryData: {
      description: "Execute a short pandas expression against loaded data and return the result.",
      inputSchema: z.object({
        expression: z.string().describe("A short pandas expression, e.g. df['Age'].describe()"),
      }),
      execute: async (input: { expression: string }) => {
        const code = `result = ${input.expression}`;
        // Look up active file to get its stored path
        const activeFile = await prisma.uploadedFile.findFirst({
          where: { userId, isActive: true },
        });
        const filePaths = activeFile ? [activeFile.storedPath] : [];
        return executorClient.executeCode(code, filePaths);
      },
    },
  };
}

function filenameToVariable(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getColumnNames(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const meta = metadata as Record<string, unknown>;
  const basicInfo = meta.basic_info as Record<string, unknown> | undefined;
  return (basicInfo?.column_names as string[]) ?? [];
}
