# Migration Guide - Shopfront & Inventory Upgrade

## 1. Cloudflare R2 Uploads

We have migrated from base64/direct S3 uploads to a Presigned URL flow with Cloudflare R2.

### Environment Variables
Ensure these are set in `.env`:
```bash
CF_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=your_bucket_name
R2_PUBLIC_BASE_URL=https://cdn.tallypadi.com
```

### R2 / S3 CORS Configuration
You must configure CORS on your R2 bucket to allow uploads from your domain.

Example CORS Policy (JSON):
```json
[
  {
    "AllowedOrigins": [
      "https://tallypadi.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "PUT",
      "GET",
      "DELETE"
    ],
    "AllowedHeaders": [
      "Content-Type"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

## 2. Inventory Categories
- **Database**: `Inventory` model now has a `category` field (string, lowercase).
- **API**: 
    - `GET /api/inventory` now returns `category`.
    - `GET /api/inventory/categories` returns distinct categories.

## 3. Shop Settings
- **Database**: `User` model now has:
    - `shopDescription` (string)
    - `heroImageUrl` (string)
- **API**:
    - `GET /api/shop/me` returns shop details.
    - `PUT /api/shop/me` updates shop details.

## 4. Image Replacement Policy
- When a user replaces a Hero Image, the backend attempts to delete the old image from R2 **if and only if** the URL starts with `R2_PUBLIC_BASE_URL`.
- This ensures we don't delete external images or base64 strings accidentally.

## 5. Client-Side Compression
- Images are now compressed on the client (Canvas API) before upload.
- Max width: 1600px.
- Format: JPEG (0.8 quality).