// api_gateway/src/routes/index.js
const fp = require('fastify-plugin');

async function apiRoutes(fastify, options) {
    fastify.register(require('./notification.routes'), { prefix: '/api/v1/notifications' });
}

module.exports = fp(apiRoutes);
