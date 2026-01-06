-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "providers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "markup_retail" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "markup_reseller" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "is_fixed_amount" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products_unique" (
    "id" SERIAL NOT NULL,
    "name_normalized" VARCHAR(500) NOT NULL,
    "category_id" INTEGER,
    "embedding" vector(768),
    "last_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "best_provider_id" INTEGER,
    "suggested_price_retail" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggested_price_reseller" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_unique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "raw_name" VARCHAR(500) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_messages" (
    "id" SERIAL NOT NULL,
    "provider_id" INTEGER,
    "phone_number" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "products_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_phone_number_key" ON "providers"("phone_number");

-- CreateIndex
CREATE INDEX "providers_phone_number_idx" ON "providers"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "price_history_product_id_idx" ON "price_history"("product_id");

-- CreateIndex
CREATE INDEX "price_history_created_at_idx" ON "price_history"("created_at" DESC);

-- CreateIndex
CREATE INDEX "raw_messages_status_idx" ON "raw_messages"("status");

-- CreateIndex
CREATE INDEX "raw_messages_provider_id_idx" ON "raw_messages"("provider_id");

-- AddForeignKey
ALTER TABLE "products_unique" ADD CONSTRAINT "products_unique_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products_unique" ADD CONSTRAINT "products_unique_best_provider_id_fkey" FOREIGN KEY ("best_provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products_unique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_messages" ADD CONSTRAINT "raw_messages_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
