// ✅ Imports
require("dotenv").config(); // Loads .env locally (ignored on Vercel)
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ Environment variables
const SHOP_DOMAIN = process.env.SHOP_DOMAIN || "aef057-93.myshopify.com";
const API_TOKEN = process.env.API_TOKEN || "bqH4U_FvWCiXkwwc7b-gIcD15Ts";

// ✅ Axios setup
const axiosInstance = axios.create({
  headers: { "User-Agent": "MyShopifyApp/1.0 (contact@example.com)" },
});

// ✅ Simple in-memory cache (10 minutes)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/* ============================================================
   ✅ Unified Endpoint — single + bulk support
   Examples:
   🔹 Single → /api/product-reviews?shopifyId=7475575128203
   🔹 Bulk   → /api/product-reviews?ids=7475575128203,7475573489803
============================================================ */
app.all("/api/product-reviews", async (req, res) => {
  try {
    // Handle both single & bulk
    const singleId = req.query.shopifyId;
    const bulkIds = req.query.ids ? req.query.ids.split(",") : [];
    const shopifyIds = singleId ? [singleId] : bulkIds;

    if (!Array.isArray(shopifyIds) || shopifyIds.length === 0) {
      return res.status(400).json({
        error: "Missing ?shopifyId= or ?ids= query parameter",
      });
    }

    // Check cache
    const cacheKey = shopifyIds.sort().join(",");
    const cached = getCache(cacheKey);
    if (cached) {
      console.log("⚡ Cache hit:", cacheKey);
      return res.json(cached);
    }

    // Fetch all reviews
    const results = [];

    await Promise.all(
      shopifyIds.map(async (externalId) => {
        try {
          console.log("🔍 Fetching product:", externalId);
          let judgeMeProductId = null;

          // ✅ Step 1: Try by external_id (with /-1)
          let productResponse = await axiosInstance.get(
            `https://judge.me/api/v1/products/-1?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${externalId}`
          );

          if (productResponse.data?.product?.id) {
            judgeMeProductId = productResponse.data.product.id;
            console.log(`✅ Found via external_id: ${judgeMeProductId}`);
          } else {
            // ✅ Step 2: Try by handle
            console.log(`⚠️ Not found by external_id (${externalId}), trying handle...`);
            const handleResponse = await axiosInstance.get(
              `https://judge.me/api/v1/products/-1?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&handle=${externalId}`
            );
            judgeMeProductId = handleResponse.data?.product?.id || null;
            if (judgeMeProductId)
              console.log(`✅ Found via handle: ${judgeMeProductId}`);
          }

          if (!judgeMeProductId) {
            console.warn(`❌ No Judge.me product found for ${externalId}`);
            results.push({ shopifyId: externalId, reviews: [] });
            return;
          }

          // ✅ Step 3: Fetch reviews for found product
          const reviewsResponse = await axiosInstance.get(
            `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&product_id=${judgeMeProductId}&per_page=20&page=1`
          );

          results.push({
            shopifyId: externalId,
            judgeMeProductId,
            reviews: reviewsResponse.data.reviews || [],
          });
        } catch (err) {
          console.error(`🚫 Error fetching for ${externalId}:`, err.message);
          results.push({ shopifyId: externalId, error: err.message });
        }
      })
    );

    // Format final response
    const response =
      shopifyIds.length === 1
        ? results[0]
        : { count: results.length, results };

    // Cache for next time
    setCache(cacheKey, response);
    console.log("✅ Cached:", cacheKey);

    res.json(response);
  } catch (error) {
    console.error("❌ Unified fetch error:", error.message);
    res.status(500).json({
      error: "Failed to fetch product reviews",
      details: error.message,
    });
  }
});

// ✅ Health check route
app.get("/", (req, res) => {
  res.json({ message: "🚀 Express API running successfully!" });
});

// ✅ Export for Vercel (no listen there)
module.exports = app;

// ✅ Run locally only
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Local server running on http://localhost:${PORT}`);
  });
}
