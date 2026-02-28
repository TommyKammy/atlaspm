-- CreateEnum
CREATE TYPE "FormQuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'EMAIL', 'SELECT', 'MULTI_SELECT', 'DATE', 'CHECKBOX');

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "public_token" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_questions" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "type" "FormQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "submitter_name" TEXT NOT NULL,
    "submitter_email" TEXT NOT NULL,
    "created_task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_answers" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(65,30),
    "value_boolean" BOOLEAN,
    "value_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forms_public_token_key" ON "forms"("public_token");

-- CreateIndex
CREATE INDEX "forms_project_id_archived_at_idx" ON "forms"("project_id", "archived_at");

-- CreateIndex
CREATE INDEX "form_questions_form_id_position_idx" ON "form_questions"("form_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_created_task_id_key" ON "form_submissions"("created_task_id");

-- CreateIndex
CREATE INDEX "form_submissions_form_id_created_at_idx" ON "form_submissions"("form_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "form_answers_submission_id_question_id_key" ON "form_answers"("submission_id", "question_id");

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_created_task_id_fkey" FOREIGN KEY ("created_task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "form_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
