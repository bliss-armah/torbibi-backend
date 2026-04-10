/*
  Warnings:

  - You are about to drop the column `commission_amount` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `commission_rate` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `net_amount` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the `payouts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transfer_recipients` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_order_id_fkey";

-- DropForeignKey
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "transfer_recipients" DROP CONSTRAINT "transfer_recipients_shop_id_fkey";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "commission_amount",
DROP COLUMN "commission_rate",
DROP COLUMN "net_amount";

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "subaccount_code" TEXT;

-- DropTable
DROP TABLE "payouts";

-- DropTable
DROP TABLE "transfer_recipients";

-- DropEnum
DROP TYPE "PayoutStatus";
