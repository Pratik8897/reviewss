const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json()); // Needed for POST JSON parsing

const port = process.env.PORT || 3000;

// ✅ Judge.me Credentials
const SHOP_DOMAIN = process.env.SHOP_DOMAIN || 'aef057-93.myshopify.com';
const API_TOKEN = process.env.API_TOKEN || 'bqH4U_FvWCiXkwwc7b-gIcD15Ts';
 
// ✅ Axios setup
const axiosInstance = axios.create({
  headers: { 'User-Agent': 'MyShopifyApp/1.0 (contact@example.com)' },
});

/* ============================================================
   ✅ SINGLE PRODUCT REVIEWS
   Example:
   https://your-domain.com/api/product-reviews?shopifyId=7475575128203
============================================================ */
app.get('/api/product-reviews', async (req, res) => {
  const externalId = req.query.shopifyId;

  if (!externalId) {
    return res
      .status(400)
      .json({ error: 'Missing required query parameter: shopifyId' });
  }

  try {
    console.log(`Fetching product info for external ID: ${externalId}`);

    // Step 1: Get Judge.me product ID
    const productResponse = await axiosInstance.get(
      `https://judge.me/api/v1/products/-1?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${externalId}`
    );

    const judgeMeProductId = productResponse.data?.product?.id;

    if (!judgeMeProductId) {
      return res
        .status(404)
        .json({ error: 'Product not found on Judge.me' });
    }

    // Step 2: Get reviews for that product
    const reviewsResponse = await axiosInstance.get(
      `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&product_id=${judgeMeProductId}&per_page=20&page=1`
    );

    res.json({
      shopifyId: externalId,
      judgeMeProductId,
      reviews: reviewsResponse.data.reviews || [],
    });
  } catch (error) {
    console.error(
      'Error fetching Judge.me data:',
      error.response?.data || error.message
    );
    res.status(500).json({
      error: 'Failed to retrieve product reviews.',
      details: error.message,
      response: error.response?.data || null,
    });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "🚀 Express API running successfully on Vercel!" });
});

/* ============================================================
   ✅ BULK PRODUCT REVIEWS
   Supports:
   🔹 GET  /api/bulk-product-reviews?ids=123,456,789
   🔹 POST /api/bulk-product-reviews  { "shopifyIds": ["123","456","789"] }
============================================================ */
app.all('/api/bulk-product-reviews', async (req, res) => {
  // 🧠 Safely handle both GET and POST inputs
  const idsFromQuery = req.query.ids ? req.query.ids.split(',') : [];
  const idsFromBody = req.body?.shopifyIds || req.body?.ids || [];
  const shopifyIds = idsFromQuery.length > 0 ? idsFromQuery : idsFromBody;

  if (!Array.isArray(shopifyIds) || shopifyIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid shopifyIds array' });
  }

  try {
    const results = [];

    await Promise.all(
      shopifyIds.map(async (externalId) => {
        try {
          // 1️⃣ Get Judge.me product ID
          const productResponse = await axiosInstance.get(
            `https://judge.me/api/v1/products/-1?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&external_id=${externalId}`
          );

          const judgeMeProductId = productResponse.data?.product?.id;

          if (!judgeMeProductId) {
            console.warn(
              `No Judge.me product found for external_id ${externalId}`
            );
            results.push({ shopifyId: externalId, reviews: [] });
            return;
          }

          // 2️⃣ Get product reviews
          const reviewsResponse = await axiosInstance.get(
            `https://judge.me/api/v1/reviews?shop_domain=${SHOP_DOMAIN}&api_token=${API_TOKEN}&product_id=${judgeMeProductId}&per_page=20&page=1`
          );

          results.push({
            shopifyId: externalId,
            judgeMeProductId,
            reviews: reviewsResponse.data.reviews || [],
          });
        } catch (err) {
          console.error(`Error fetching for ${externalId}:`, err.message);
          results.push({ shopifyId: externalId, error: err.message });
        }
      })
    );

    res.json({ count: results.length, results });
  } catch (error) {
    console.error('Bulk fetch error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch bulk product reviews',
      details: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
