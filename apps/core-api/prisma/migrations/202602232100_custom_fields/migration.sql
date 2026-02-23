-- Custom Fields System Migration
-- Supports 10 field types: text, number, date, select, multi_select, user, checkbox, url, email, phone

-- CustomFieldDefinition stores the field configuration per project
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL, -- text, number, date, select, multi_select, user, checkbox, url, email, phone
    "options" JSONB, -- For select/multi_select: array of {id, label, color}
    "config" JSONB DEFAULT '{}', -- Additional config: { required, defaultValue, min, max, etc. }
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CustomFieldValue stores the actual values for each task
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "value" JSONB NOT NULL, -- Stored as JSON to accommodate different types
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- Indexes for performance
CREATE INDEX "CustomFieldDefinition_projectId_idx" ON "CustomFieldDefinition"("projectId");
CREATE INDEX "CustomFieldDefinition_projectId_isActive_idx" ON "CustomFieldDefinition"("projectId", "isActive");
CREATE INDEX "CustomFieldValue_fieldDefinitionId_idx" ON "CustomFieldValue"("fieldDefinitionId");
CREATE INDEX "CustomFieldValue_taskId_idx" ON "CustomFieldValue"("taskId");
CREATE UNIQUE INDEX "CustomFieldValue_fieldDefinitionId_taskId_key" ON "CustomFieldValue"("fieldDefinitionId", "taskId");

-- Foreign keys
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_projectId_fkey" 
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldDefinitionId_fkey" 
    FOREIGN KEY ("fieldDefinitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_taskId_fkey" 
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
