-- CreateTable
CREATE TABLE "FormMapping" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "formSignature" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormMapping_provider_formSignature_key" ON "FormMapping"("provider", "formSignature");
