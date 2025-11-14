// api_gateway/src/routes/index.js
const fp = require('fastify-plugin');
const { notificationRoutes, statusRoutes } = require('./notification.routes');

async function apiRoutes(fastify, options) {
    // Register notification routes
    fastify.register(notificationRoutes, { prefix: '/api/v1/notifications' });
    
    // Register status update routes (email/push status endpoints)
    fastify.register(statusRoutes, { prefix: '/api/v1' });
}

module.exports = fp(apiRoutes);
