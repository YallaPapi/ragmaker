const express = require('express');
const swaggerUi = require('swagger-ui-express');
const DocsController = require('../../controllers/docsController');

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check API health status and get service information
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: 'RAGMaker API'
 *                 version:
 *                   type: string
 *                   example: '1.0.0'
 *                 status:
 *                   type: string
 *                   example: 'healthy'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', DocsController.getHealth);

/**
 * @swagger
 * /info:
 *   get:
 *     summary: API information and getting started guide
 *     description: Get comprehensive API information, features, and usage examples
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 info:
 *                   type: object
 *                   description: Comprehensive API information
 */
router.get('/info', DocsController.getInfo);

// Swagger UI documentation
router.use('/docs', swaggerUi.serve);
router.get('/docs', swaggerUi.setup(require('../../docs/swagger'), {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'RAGMaker API Documentation'
}));

// OpenAPI spec as JSON
router.get('/docs/openapi.json', DocsController.getSpec);

module.exports = router;