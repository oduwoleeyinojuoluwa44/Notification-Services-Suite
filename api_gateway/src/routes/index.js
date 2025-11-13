// api_gateway/src/routes/index.js
const fp = require('fastify-plugin');

async function apiRoutes(fastify, options) {
    fastify.register(require('./notification.routes'), { prefix: '/api/v1/notifications' });
    // Add other route registrations here if needed, e.g.:
    // fastify.register(require('./user.routes'), { prefix: '/api/v1/users' });
}

module.exports = fp(apiRoutes);
