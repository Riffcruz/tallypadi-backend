# Cloudflare R2 Presigned Uploads Migration Guide

This document outlines the new image upload flow using Cloudflare R2 presigned PUT URLs and necessary CORS configurations.

## New Image Upload Flow

1.  **Next.js client asks backend for a presigned PUT URL:** The frontend sends a request to the backend with the desired `mime` type and `ext`ension of the image.
2.  **Backend generates and returns a presigned PUT URL:** The backend (specifically, the `/api/uploads/presign` endpoint) uses the AWS SDK to generate a temporary, signed URL that allows the client to directly upload a file to Cloudflare R2. It also returns a `publicUrl` (CDN URL) for the uploaded image.
3.  **Client uploads file directly to R2 via PUT:** The frontend then uses the received `uploadUrl` to directly upload the image file to Cloudflare R2 using a PUT request.
4.  **Client sends inventory create/update with image = public CDN URL:** After a successful upload to R2, the frontend sends the `publicUrl` of the image to the backend when creating or updating an inventory item.

## Required Cloudflare R2 Bucket CORS Configuration

To allow direct uploads from your frontend domain to your R2 bucket, you need to configure CORS policies on your Cloudflare R2 bucket.

Here's an example CORS policy that allows `PUT` requests from `https://tallypadi.com`:

```json
[
  {
    "AllowedOrigins": [
      "https://tallypadi.com"
    ],
    "AllowedMethods": [
      "PUT"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

**Explanation of fields:**

*   `AllowedOrigins`: The domains that are allowed to make requests to your R2 bucket. Replace `https://tallypadi.com` with your actual frontend domain. You can add multiple origins.
*   `AllowedMethods`: The HTTP methods that are allowed. For presigned PUT uploads, `PUT` is required.
*   `AllowedHeaders`: Which headers can be used in the actual request. Using `*` is generally permissive but simpler. If you need stricter control, list specific headers (e.g., `"Content-Type"`).
*   `ExposeHeaders`: Headers that browsers are allowed to access. Typically not needed for simple PUT uploads.
*   `MaxAgeSeconds`: How long the results of a preflight request (OPTIONS) can be cached.

## Backward Compatibility

*   **Existing `/uploads` static route:** The backend's `/uploads` static route for serving images will remain functional. Existing inventory items with image paths like `/uploads/some-image.jpg` will continue to display correctly.
*   **Base64 uploads:** For a temporary period, the backend will still accept `data:image/...` base64 strings for image uploads in `addInventoryItem` and `updateInventoryItem` to ensure backward compatibility. It is recommended to migrate all frontend image uploads to the new R2 presigned URL flow.
