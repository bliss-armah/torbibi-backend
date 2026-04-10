-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'cancelled');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "shop_subscriptions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "paystack_plan_code" TEXT NOT NULL,
    "paystack_subscription_code" TEXT,
    "paystack_customer_code" TEXT,
    "paystack_email_token" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_subscriptions_shop_id_key" ON "shop_subscriptions"("shop_id");

-- AddForeignKey
ALTER TABLE "shop_subscriptions" ADD CONSTRAINT "shop_subscriptions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
