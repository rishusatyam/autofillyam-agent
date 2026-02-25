-- CreateTable
CREATE TABLE "SearchMapping" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "formSignature" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchMapping_provider_vertical_formSignature_key" ON "SearchMapping"("provider", "vertical", "formSignature");
