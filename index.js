const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Environment variables (from Vercel)
const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const API_TOKEN = process.env.API_TOKEN;

// Axios instance
const axiosInstance = axios.create({
  headers: { "User-Agent": "MyShopifyApp/1.0 (contact@example.com)" },
});

// ============================================================
// ✅ UNIFIED REVIEWS ENDPOINT
// Handles both single & multiple products in one proxy
// ============================================================
app.all("/api/product-reviews", async (req, res) => {
  try {
    // Get single or multiple IDs
    const singleId = req.query.shopifyId;
    const bulkIds = req.query.ids ? req.query.ids.split(",") : [];

    // Combine logic
    const shopifyIds = singleId ? [singleId] : bulkIds;

    if (!Array.isArray(shopifyIds) || shopifyIds.length === 0) {
      return res.status(400).json({
        error: "Missing ?shopifyId= or ?ids= parameters",
      });
    }

    const results = [];

    await Promise.all(
      shopifyIds.map(async (externalId) => {
        try {
          // Step 1: Get Judge.me Product ID
          const productResponse = await axiosInstance.get(
            `https://judge.me/api/v1/products?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${externalId}`
          );

          const judgeMeProductId = productResponse.data?.product?.id;

          if (!judgeMeProductId) {
            results.push({ shopifyId: externalId, reviews: [] });
            return;
          }

          // Step 2: Get Reviews
          const reviewsResponse = await axiosInstance.get(
            `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&product_id=${judgeMeProductId}&per_page=20&page=1`
          );

          results.push({
            shopifyId: externalId,
            judgeMeProductId,
            reviews: reviewsResponse.data.reviews || [],
          });
        } catch (err) {
          results.push({
            shopifyId: externalId,
            error: err.message,
          });
        }
      })
    );

    // If single product → return single object
    if (shopifyIds.length === 1) {
      return res.json(results[0]);
    }

    // Otherwise return multiple results
    return res.json({
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Error in unified reviews route:", error.message);
    res.status(500).json({
      error: "Failed to fetch reviews",
      details: error.message,
    });
  }
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "🚀 Express API running successfully on Vercel!" });
});

module.exports = app;
