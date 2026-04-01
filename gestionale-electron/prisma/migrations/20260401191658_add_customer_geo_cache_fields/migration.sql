-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "geoCachedAt" DATETIME;
ALTER TABLE "Customer" ADD COLUMN "geoLat" REAL;
ALTER TABLE "Customer" ADD COLUMN "geoLng" REAL;
