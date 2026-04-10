-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "payout_account_name" TEXT,
ADD COLUMN     "payout_account_number" TEXT,
ADD COLUMN     "payout_bank_code" TEXT,
ADD COLUMN     "payout_type" TEXT;
